package com.khlan.security;

import com.khlan.config.DualAuthFilter;
import com.khlan.controller.*;
import com.khlan.dto.*;
import com.khlan.entity.*;
import com.khlan.repository.*;
import com.khlan.service.*;
import org.springframework.mock.web.MockMultipartFile;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Automated JUnit security regression test suite verifying full-stack security
 * hardening:
 * 1. Admin persona impersonation via header/cookie is blocked and demo mode
 * safely defaults to false.
 * 2. Cross-tenant fallback is removed and returns 403 Forbidden for
 * non-members.
 * 3. Unauthenticated requests to protected endpoints return 401 Unauthorized.
 * 4. Unauthenticated cron trigger returns 401 Unauthorized (and fails if
 * unconfigured).
 * 5. Captcha "bypass" token backdoor is removed and rejected.
 */
@ExtendWith(MockitoExtension.class)
class SecurityHardeningRegressionTest {

        @AfterEach
        void tearDown() {
                SecurityContextHolder.clearContext();
        }

        // =========================================================================
        // 1. Admin Persona Impersonation & Safe Demo Defaults
        // =========================================================================
        @Nested
        @DisplayName("1. Admin Persona Impersonation & Safe Demo Defaults")
        class AdminPersonaAndDemoModeTests {

                @Mock
                private SessionTokenService sessionTokenService;
                @Mock
                private UserRepository userRepository;
                @Mock
                private Environment environment;

                @Test
                @DisplayName("ALLOWED_PERSONA_IDS must not contain 'usr_admin'")
                void allowedPersonaIdsExcludesAdmin() {
                        assertFalse(DualAuthFilter.ALLOWED_PERSONA_IDS.contains("usr_admin"),
                                        "usr_admin must never be present in ALLOWED_PERSONA_IDS");
                }

                @Test
                @DisplayName("Admin persona header (x-khlan-persona: usr_admin) is blocked even if demo mode is enabled")
                void adminPersonaHeaderIsBlocked() {
                        when(environment.getActiveProfiles()).thenReturn(new String[] { "local" });
                        when(environment.getProperty("APP_DEMO_MODE")).thenReturn("true");

                        DualAuthFilter filter = new DualAuthFilter(sessionTokenService, userRepository, environment);
                        assertTrue(filter.isDemoModeEnabled());

                        MockHttpServletRequest request = new MockHttpServletRequest();
                        request.addHeader("x-khlan-persona", "usr_admin");

                        String resolvedId = filter.resolveUserId(request);
                        assertNull(resolvedId, "Admin persona impersonation via header must return null");
                }

                @Test
                @DisplayName("Admin persona cookie (khlan_persona=usr_admin) is blocked even if demo mode is enabled")
                void adminPersonaCookieIsBlocked() {
                        when(environment.getActiveProfiles()).thenReturn(new String[] { "local" });
                        when(environment.getProperty("APP_DEMO_MODE")).thenReturn("true");

                        DualAuthFilter filter = new DualAuthFilter(sessionTokenService, userRepository, environment);
                        assertTrue(filter.isDemoModeEnabled());

                        MockHttpServletRequest request = new MockHttpServletRequest();
                        request.setCookies(new Cookie("khlan_persona", "usr_admin"));

                        String resolvedId = filter.resolveUserId(request);
                        assertNull(resolvedId, "Admin persona impersonation via cookie must return null");
                }

                @Test
                @DisplayName("isDemoModeEnabled() defaults to false when APP_DEMO_MODE is not configured")
                void demoModeDefaultsToFalse() {
                        when(environment.getActiveProfiles()).thenReturn(new String[] {});
                        when(environment.getProperty("APP_DEMO_MODE")).thenReturn(null);
                        when(environment.getProperty("app.demo.mode")).thenReturn(null);

                        DualAuthFilter filter = new DualAuthFilter(sessionTokenService, userRepository, environment);
                        assertFalse(filter.isDemoModeEnabled(),
                                        "Demo mode must default to false unless explicitly configured");

                        // When demo mode is false, even non-admin persona cookie/header is rejected
                        MockHttpServletRequest request = new MockHttpServletRequest();
                        request.addHeader("x-khlan-persona", "usr_dealer_sokha");
                        request.setCookies(new Cookie("khlan_persona", "usr_dealer_sokha"));

                        assertNull(filter.resolveUserId(request),
                                        "Persona switching must be completely ignored when demo mode is false");
                }

                @Test
                @DisplayName("isDemoModeEnabled() returns false when active profile is production even if APP_DEMO_MODE=true")
                void demoModeDisabledInProductionProfile() {
                        when(environment.getActiveProfiles()).thenReturn(new String[] { "production" });

                        DualAuthFilter filter = new DualAuthFilter(sessionTokenService, userRepository, environment);
                        assertFalse(filter.isDemoModeEnabled(),
                                        "Demo mode must never be enabled when active profile is production");
                }

                @Test
                @DisplayName("isDemoModeEnabled() returns false when active profile is prod even if APP_DEMO_MODE=true")
                void demoModeDisabledInProdProfile() {
                        when(environment.getActiveProfiles()).thenReturn(new String[] { "prod" });

                        DualAuthFilter filter = new DualAuthFilter(sessionTokenService, userRepository, environment);
                        assertFalse(filter.isDemoModeEnabled(),
                                        "Demo mode must never be enabled when active profile is prod");
                }

                @Test
                @DisplayName("Admin impersonation attempt leaves SecurityContext unauthenticated")
                void adminImpersonationDoesNotAuthenticateSecurityContext() throws Exception {
                        when(environment.getActiveProfiles()).thenReturn(new String[] { "local" });
                        when(environment.getProperty("APP_DEMO_MODE")).thenReturn("true");

                        DualAuthFilter filter = new DualAuthFilter(sessionTokenService, userRepository, environment);

                        MockHttpServletRequest request = new MockHttpServletRequest();
                        request.addHeader("x-khlan-persona", "usr_admin");
                        request.setCookies(new Cookie("khlan_persona", "usr_admin"));
                        MockHttpServletResponse response = new MockHttpServletResponse();
                        FilterChain chain = mock(FilterChain.class);

                        filter.doFilter(request, response, chain);

                        verify(chain).doFilter(request, response);
                        verify(userRepository, never()).findById("usr_admin");
                        assertNull(SecurityContextHolder.getContext().getAuthentication(),
                                        "SecurityContextHolder must remain null after blocked admin impersonation");
                }
        }

        // =========================================================================
        // 2. Multi-Tenant Isolation & IDOR Prevention
        // =========================================================================
        @Nested
        @DisplayName("2. Multi-Tenant Isolation & IDOR Prevention")
        class MultiTenantIsolationTests {

                @Mock
                private TenantInventoryService tenantInventoryService;
                @Mock
                private PaymentService paymentService;
                @Mock
                private TelegramService telegramService;
                @Mock
                private TenantMemberRepository tenantMemberRepository;

                @Test
                @DisplayName("TenantInventoryController: returns 403 Forbidden for non-member without calling findAll fallback")
                void tenantInventoryRejectsNonMemberWith403() {
                        TenantInventoryController controller = new TenantInventoryController(tenantInventoryService,
                                        tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getInventory(null, null, null, null, null, "newest", null,
                                                        null, null, outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Not an active tenant member"));

                        // Verify the dangerous fallback findAll().stream().findFirst() is never
                        // invoked!
                        verify(tenantMemberRepository, never()).findAll();
                }

                @Test
                @DisplayName("TenantInventoryController: returns 401 Unauthorized for unauthenticated request")
                void tenantInventoryRejectsUnauthenticatedWith401() {
                        TenantInventoryController controller = new TenantInventoryController(tenantInventoryService,
                                        tenantMemberRepository);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller
                                        .getInventory(null, null, null, null, null, "newest", null, null, null, null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(tenantMemberRepository, never()).findAll();
                }

                @Test
                @DisplayName("TenantInventoryController: resolves active tenant member correctly")
                void tenantInventoryAllowsActiveMember() {
                        TenantInventoryController controller = new TenantInventoryController(tenantInventoryService,
                                        tenantMemberRepository);
                        UserEntity dealer = UserEntity.builder().id("usr_dealer_1").role("DEALER").build();
                        TenantMemberEntity member = TenantMemberEntity.builder()
                                        .id("mem_1")
                                        .tenantId("tenant_khlan_auto")
                                        .userId("usr_dealer_1")
                                        .status("ACTIVE")
                                        .build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_dealer_1", "ACTIVE"))
                                        .thenReturn(Optional.of(member));
                        when(tenantInventoryService.getInventory(eq("tenant_khlan_auto"), any(), any(), any(), any(),
                                        any(), any(), any(), any()))
                                        .thenReturn(Map.of("vehicles", List.of()));

                        var response = controller.getInventory(null, null, null, null, null, "newest", null, null, null,
                                        dealer);
                        assertEquals(HttpStatus.OK, response.getStatusCode());
                }

                @Test
                @DisplayName("PaymentController: returns 403 Forbidden for non-member without calling findAll fallback")
                void paymentControllerRejectsNonMemberWith403() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getTenantPayments(outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Not an active member of a tenant"));

                        // Verify findAll fallback was eliminated
                        verify(tenantMemberRepository, never()).findAll();
                }

                @Test
                @DisplayName("PaymentController: createPayment returns 403 Forbidden for non-member")
                void paymentControllerCreatePaymentRejectsNonMemberWith403() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        PaymentDTO.CreatePaymentRequest req = PaymentDTO.CreatePaymentRequest.builder()
                                        .plan("PRO")
                                        .billingCycle("MONTHLY")
                                        .build();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.createPayment(req, outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        verify(paymentService, never()).createPayment(anyString(), any());
                        verify(tenantMemberRepository, never()).findAll();
                }

                @Test
                @DisplayName("PaymentController: cancelPayment returns 403 Forbidden for non-member")
                void paymentControllerCancelPaymentRejectsNonMemberWith403() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.cancelPayment("pay_123", outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        verify(paymentService, never()).cancelPayment(anyString(), anyString());
                        verify(tenantMemberRepository, never()).findAll();
                }

                @Test
                @DisplayName("PaymentController: returns 401 Unauthorized for unauthenticated request")
                void paymentControllerRejectsUnauthenticatedWith401() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getTenantPayments(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(tenantMemberRepository, never()).findAll();
                }

                @Test
                @DisplayName("TelegramController: getSellerTelegram returns 401 Unauthorized when unauthenticated")
                void telegramControllerGetRejectsUnauthenticated() {
                        TelegramController controller = new TelegramController(telegramService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getSellerTelegram(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(telegramService, never()).getSellerTelegram(anyString());
                }

                @Test
                @DisplayName("TelegramController: updateSellerTelegram returns 401 Unauthorized when unauthenticated")
                void telegramControllerUpdateRejectsUnauthenticated() {
                        TelegramController controller = new TelegramController(telegramService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller
                                        .updateSellerTelegram(new TelegramDTO.UpdateSellerTelegramRequest(), null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(telegramService, never()).updateSellerTelegram(anyString(), any());
                }

                @Test
                @DisplayName("TelegramController: testSellerTelegram returns 401 Unauthorized when unauthenticated")
                void telegramControllerTestRejectsUnauthenticated() {
                        TelegramController controller = new TelegramController(telegramService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.testSellerTelegram(Map.of("chatId", "12345"), null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(telegramService, never()).sendSellerTestNotification(anyString(), anyString());
                }

                @Test
                @DisplayName("PaymentController: getPaymentById returns 401 Unauthorized when unauthenticated")
                void paymentControllerGetPaymentByIdRejectsUnauthenticated() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getPaymentById("pay_123", null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(paymentService, never()).getPaymentById(anyString(), any());
                }

                @Test
                @DisplayName("PaymentController: getPaymentById returns 403 Forbidden for non-member")
                void paymentControllerGetPaymentByIdRejectsNonMemberWith403() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getPaymentById("pay_123", outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        verify(paymentService, never()).getPaymentById(anyString(), any());
                }

                @Test
                @DisplayName("PaymentController: uploadReceipt returns 401 Unauthorized when unauthenticated")
                void paymentControllerUploadReceiptRejectsUnauthenticated() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg",
                                        new byte[] { 1, 2, 3 });

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.uploadReceipt("pay_123", file, null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(paymentService, never()).uploadReceipt(anyString(), any(), any());
                }

                @Test
                @DisplayName("PaymentController: uploadReceipt returns 403 Forbidden for non-member")
                void paymentControllerUploadReceiptRejectsNonMemberWith403() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();
                        MockMultipartFile file = new MockMultipartFile("file", "test.jpg", "image/jpeg",
                                        new byte[] { 1, 2, 3 });

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.uploadReceipt("pay_123", file, outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        verify(paymentService, never()).uploadReceipt(anyString(), any(), any());
                }

                @Test
                @DisplayName("PaymentController: getPrintableReceipt returns 401 Unauthorized when unauthenticated")
                void paymentControllerGetPrintableReceiptRejectsUnauthenticated() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getPrintableReceipt("pay_123", null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(paymentService, never()).renderPrintableReceiptHtml(anyString(), any());
                }

                @Test
                @DisplayName("PaymentController: getPrintableReceipt returns 403 Forbidden for non-member")
                void paymentControllerGetPrintableReceiptRejectsNonMemberWith403() {
                        PaymentController controller = new PaymentController(paymentService, tenantMemberRepository);
                        UserEntity outsider = UserEntity.builder().id("usr_outsider").role("SELLER").build();

                        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_outsider", "ACTIVE"))
                                        .thenReturn(Optional.empty());

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getPrintableReceipt("pay_123", outsider));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        verify(paymentService, never()).renderPrintableReceiptHtml(anyString(), any());
                }

                @Test
                @DisplayName("TelegramController: setupWebhook returns 401 Unauthorized when unauthenticated")
                void telegramControllerSetupWebhookRejectsUnauthenticated() {
                        TelegramController controller = new TelegramController(telegramService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.setupWebhook("https://example.com/hook", null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(telegramService, never()).setupWebhook(anyString());
                }

                @Test
                @DisplayName("TelegramController: setupWebhook returns 403 Forbidden for non-admin user")
                void telegramControllerSetupWebhookRejectsNonAdmin() {
                        TelegramController controller = new TelegramController(telegramService);
                        UserEntity buyer = UserEntity.builder().id("usr_buyer").role("BUYER").build();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.setupWebhook("https://example.com/hook", buyer));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Admin access required"));
                        verify(telegramService, never()).setupWebhook(anyString());
                }

                @Test
                @DisplayName("TelegramController: setupWebhook allows ADMIN user")
                void telegramControllerSetupWebhookAllowsAdmin() {
                        TelegramController controller = new TelegramController(telegramService);
                        UserEntity admin = UserEntity.builder().id("usr_admin_1").role("ADMIN").build();

                        when(telegramService.setupWebhook("https://example.com/hook")).thenReturn(Map.of("ok", true));

                        var res = controller.setupWebhook("https://example.com/hook", admin);
                        assertEquals(HttpStatus.OK, res.getStatusCode());
                        verify(telegramService).setupWebhook("https://example.com/hook");
                }
        }

        // =========================================================================
        // 3. Defense-in-Depth Endpoint Security & Cron Automation
        // =========================================================================
        @Nested
        @DisplayName("3. Cron Authentication & Defense-in-Depth")
        class CronSecurityTests {

                @Test
                @DisplayName("SecurityConfig isCronAuthorized: rejects null or invalid header, requires Bearer matching cronSecret")
                void securityConfigCronValidation() {
                        com.khlan.config.SecurityConfig config = new com.khlan.config.SecurityConfig(null, null);
                        ReflectionTestUtils.setField(config, "cronSecret", "my-cron-secret");

                        assertFalse(config.isCronAuthorized(null), "Null auth header must be rejected");
                        assertFalse(config.isCronAuthorized(""), "Blank auth header must be rejected");
                        assertFalse(config.isCronAuthorized("Bearer wrong"), "Wrong token must be rejected");
                        assertFalse(config.isCronAuthorized("my-cron-secret"),
                                        "Missing Bearer prefix must be rejected");
                        assertTrue(config.isCronAuthorized("Bearer my-cron-secret"),
                                        "Valid Bearer cronSecret must be authorized");

                        // When secret is not configured
                        ReflectionTestUtils.setField(config, "cronSecret", "");
                        assertFalse(config.isCronAuthorized("Bearer my-cron-secret"),
                                        "Unconfigured cron secret must reject all triggers");
                }

                @Test
                @DisplayName("Cron trigger with null Authorization header returns 401 Unauthorized")
                void unauthenticatedCronTriggerReturns401() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", "super-secret-cron-token");

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> service.validateCronAuth(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Unauthorized cron trigger"));
                }

                @Test
                @DisplayName("Cron trigger with wrong Authorization header returns 401 Unauthorized")
                void wrongTokenCronTriggerReturns401() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", "super-secret-cron-token");

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> service.validateCronAuth("Bearer invalid-secret"));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Unauthorized cron trigger"));
                }

                @Test
                @DisplayName("Cron trigger when cronSecret is empty/unconfigured returns 401 Unauthorized")
                void unconfiguredCronSecretReturns401() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", "");

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> service.validateCronAuth("Bearer some-token"));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Cron secret not configured"));
                }

                @Test
                @DisplayName("Cron trigger with valid Bearer token succeeds")
                void validCronTokenSucceeds() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", "production-cron-secret-2026");

                        assertDoesNotThrow(() -> service.validateCronAuth("Bearer production-cron-secret-2026"));
                }

                @Test
                @DisplayName("CronController delegates triggerAbaSync with null auth and rejects with 401")
                void cronControllerAbaSyncRejectsUnauthenticated() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", "production-cron-secret-2026");
                        CronController controller = new CronController(service);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.triggerAbaSync(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                }

                @Test
                @DisplayName("CronController delegates triggerSubscriptionReminders with null auth and rejects with 401")
                void cronControllerSubscriptionRemindersRejectsUnauthenticated() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", "production-cron-secret-2026");
                        CronController controller = new CronController(service);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.triggerSubscriptionReminders(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                }

                @Test
                @DisplayName("CronSchedulerService resolves secret from System property when field is null")
                void cronAuthResolvesFromSystemProperty() {
                        CronSchedulerService service = new CronSchedulerService(
                                        null, null, null, null, null, null, null, null, null);
                        ReflectionTestUtils.setField(service, "cronSecret", null);
                        String previousProp = System.getProperty("cron.secret");
                        try {
                                System.setProperty("cron.secret", "sys-prop-secret");
                                assertEquals("sys-prop-secret", service.getCronSecret());
                                assertDoesNotThrow(() -> service.validateCronAuth("Bearer sys-prop-secret"));
                                assertThrows(ResponseStatusException.class,
                                                () -> service.validateCronAuth("Bearer wrong"));
                        } finally {
                                if (previousProp != null) {
                                        System.setProperty("cron.secret", previousProp);
                                } else {
                                        System.clearProperty("cron.secret");
                                }
                        }
                }
        }

        // =========================================================================
        // 4. Captcha Backdoor Removal
        // =========================================================================
        @Nested
        @DisplayName("4. Captcha Backdoor Removal")
        class CaptchaBackdoorRemovalTests {

                @Mock
                private UserRepository userRepository;
                @Mock
                private PasswordService passwordService;
                @Mock
                private SessionTokenService sessionTokenService;
                @Mock
                private TurnstileService turnstileService;
                @Mock
                private AdminService adminService;
                @Mock
                private TenantMemberRepository tenantMemberRepository;
                @Mock
                private com.khlan.repository.SellerProfileRepository sellerProfileRepository;

                @InjectMocks
                private AuthService authService;

                @Test
                @DisplayName("AuthService login: 'bypass' captcha token is rejected with 400 Bad Request when demo mode is disabled")
                void loginBypassTokenRejectedDemoDisabled() {
                        AdminDTO.PlatformSettingsDTO settings = AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(false)
                                        .build();
                        when(adminService.getPlatformSettings()).thenReturn(settings);
                        when(turnstileService.verify(eq("bypass"), any())).thenReturn(false);

                        AuthDTO.LoginRequest req = AuthDTO.LoginRequest.builder()
                                        .phone("012345678")
                                        .password("secret123")
                                        .captchaToken("bypass")
                                        .build();

                        MockHttpServletResponse response = new MockHttpServletResponse();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> authService.login(req, response));

                        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Captcha verification failed or expired"));
                        verify(turnstileService).verify(eq("bypass"), any());
                }

                @Test
                @DisplayName("AuthService login: 'bypass' captcha token is rejected with 400 Bad Request when demo mode is enabled")
                void loginBypassTokenRejectedDemoEnabled() {
                        AdminDTO.PlatformSettingsDTO settings = AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(true)
                                        .build();
                        when(adminService.getPlatformSettings()).thenReturn(settings);
                        when(turnstileService.verify(eq("bypass"), any())).thenReturn(false);

                        AuthDTO.LoginRequest req = AuthDTO.LoginRequest.builder()
                                        .phone("012345678")
                                        .password("secret123")
                                        .captchaToken("bypass")
                                        .build();

                        MockHttpServletResponse response = new MockHttpServletResponse();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> authService.login(req, response));

                        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Captcha verification failed or expired"));
                        verify(turnstileService).verify(eq("bypass"), any());
                }

                @Test
                @DisplayName("AuthService login: missing captcha token is rejected with 400 Bad Request when demo mode is disabled")
                void loginMissingCaptchaRejectedDemoDisabled() {
                        AdminDTO.PlatformSettingsDTO settings = AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(false)
                                        .build();
                        when(adminService.getPlatformSettings()).thenReturn(settings);

                        AuthDTO.LoginRequest req = AuthDTO.LoginRequest.builder()
                                        .phone("012345678")
                                        .password("secret123")
                                        .captchaToken(null)
                                        .build();

                        MockHttpServletResponse response = new MockHttpServletResponse();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> authService.login(req, response));

                        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Captcha verification required"));
                }

                @Test
                @DisplayName("AuthService register: 'bypass' captcha token is rejected with 400 Bad Request when demo mode is disabled")
                void registerBypassTokenRejectedDemoDisabled() {
                        AdminDTO.PlatformSettingsDTO settings = AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(false)
                                        .build();
                        when(adminService.getPlatformSettings()).thenReturn(settings);
                        when(turnstileService.verify(eq("bypass"), any())).thenReturn(false);

                        AuthDTO.RegisterRequest req = AuthDTO.RegisterRequest.builder()
                                        .name("Hacker")
                                        .phone("012345678")
                                        .password("secret123456")
                                        .role("BUYER")
                                        .captchaToken("bypass")
                                        .build();

                        MockHttpServletResponse response = new MockHttpServletResponse();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> authService.register(req, response));

                        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Captcha verification failed or expired"));
                        verify(turnstileService).verify(eq("bypass"), any());
                }

                @Test
                @DisplayName("AuthService register: 'bypass' captcha token is rejected with 400 Bad Request when demo mode is enabled")
                void registerBypassTokenRejectedDemoEnabled() {
                        AdminDTO.PlatformSettingsDTO settings = AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(true)
                                        .build();
                        when(adminService.getPlatformSettings()).thenReturn(settings);
                        when(turnstileService.verify(eq("bypass"), any())).thenReturn(false);

                        AuthDTO.RegisterRequest req = AuthDTO.RegisterRequest.builder()
                                        .name("Hacker")
                                        .phone("012345678")
                                        .password("secret123456")
                                        .role("BUYER")
                                        .captchaToken("bypass")
                                        .build();

                        MockHttpServletResponse response = new MockHttpServletResponse();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> authService.register(req, response));

                        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Captcha verification failed or expired"));
                        verify(turnstileService).verify(eq("bypass"), any());
                }

                @Test
                @DisplayName("AuthService register: missing captcha token is rejected with 400 Bad Request when demo mode is disabled")
                void registerMissingCaptchaRejectedDemoDisabled() {
                        AdminDTO.PlatformSettingsDTO settings = AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(false)
                                        .build();
                        when(adminService.getPlatformSettings()).thenReturn(settings);

                        AuthDTO.RegisterRequest req = AuthDTO.RegisterRequest.builder()
                                        .name("Alice")
                                        .phone("012345678")
                                        .password("secret123456")
                                        .role("BUYER")
                                        .captchaToken(null)
                                        .build();

                        MockHttpServletResponse response = new MockHttpServletResponse();

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> authService.register(req, response));

                        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Captcha verification required"));
                }
        }

        // =========================================================================
        // 5. Controller Fallback Removal & IDOR Service Enforcement
        // =========================================================================
        @Nested
        @DisplayName("5. Controller Fallback Removal & IDOR Service Enforcement")
        class ControllerFallbackAndIdorTests {

                @Mock
                private SubscriptionPaymentRepository subscriptionPaymentRepository;
                @Mock
                private TenantRepository tenantRepository;
                @Mock
                private MinioStorageService minioStorageService;
                @Mock
                private UserRepository userRepository;
                @Mock
                private PlanAdminService planAdminService;
                @Mock
                private TenantService tenantService;
                @Mock
                private AdminService adminService;
                @Mock
                private AppointmentService appointmentService;
                @Mock
                private PurchaseService purchaseService;
                @Mock
                private FavoriteService favoriteService;
                @Mock
                private ChatService chatService;
                @Mock
                private VehicleService vehicleService;
                @Mock
                private VehicleReportService vehicleReportService;
                @Mock
                private DualAuthFilter dualAuthFilter;
                @Mock
                private SessionTokenService sessionTokenService;
                @Mock
                private TenantMemberRepository tenantMemberRepository;
                @Mock
                private SellerProfileRepository sellerProfileRepository;
                @Mock
                private SubscriptionRepository subscriptionRepository;

                @InjectMocks
                private PaymentService paymentService;

                @Test
                @DisplayName("PaymentService getPaymentById throws 403 Forbidden on cross-tenant access")
                void paymentServiceGetPaymentByIdRejectsCrossTenantWith403() {
                        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                                        .id("pay_target")
                                        .tenantId("tenant_victim")
                                        .build();

                        when(subscriptionPaymentRepository.findById("pay_target")).thenReturn(Optional.of(payment));

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> paymentService.getPaymentById("pay_target", "tenant_attacker"));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Access denied"));
                }

                @Test
                @DisplayName("PaymentService uploadReceipt throws 403 Forbidden on cross-tenant access")
                void paymentServiceUploadReceiptRejectsCrossTenantWith403() {
                        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                                        .id("pay_target")
                                        .tenantId("tenant_victim")
                                        .build();

                        when(subscriptionPaymentRepository.findById("pay_target")).thenReturn(Optional.of(payment));
                        MockMultipartFile file = new MockMultipartFile("file", "slip.jpg", "image/jpeg",
                                        new byte[] { 1, 2, 3 });

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> paymentService.uploadReceipt("pay_target", file, "tenant_attacker"));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Not authorized to upload receipt"));
                }

                @Test
                @DisplayName("PaymentService renderPrintableReceiptHtml throws 403 Forbidden on cross-tenant access")
                void paymentServiceRenderReceiptRejectsCrossTenantWith403() {
                        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                                        .id("pay_target")
                                        .tenantId("tenant_victim")
                                        .build();

                        when(subscriptionPaymentRepository.findById("pay_target")).thenReturn(Optional.of(payment));

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> paymentService
                                        .renderPrintableReceiptHtml("pay_target", "tenant_attacker"));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("Not authorized to view this payment receipt"));
                }

                @Test
                @DisplayName("TenantController getSellerSubscription returns 401 Unauthorized when unauthenticated")
                void tenantControllerGetSellerSubscriptionRejectsUnauthenticated() {
                        TenantController controller = new TenantController(tenantService, planAdminService,
                                        adminService, userRepository);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getSellerSubscription(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(tenantService, never()).getDashboard(anyString());
                }

                @Test
                @DisplayName("AppointmentController getBuyerAppointments returns 401 Unauthorized when unauthenticated")
                void appointmentControllerGetBuyerAppointmentsRejectsUnauthenticated() {
                        AppointmentController controller = new AppointmentController(appointmentService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getBuyerAppointments(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(appointmentService, never()).getBuyerAppointments(anyString());
                }

                @Test
                @DisplayName("PurchaseController getBuyerPurchases returns 401 Unauthorized when unauthenticated")
                void purchaseControllerGetBuyerPurchasesRejectsUnauthenticated() {
                        PurchaseController controller = new PurchaseController(purchaseService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getBuyerPurchases(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(purchaseService, never()).getBuyerPurchases(anyString());
                }

                @Test
                @DisplayName("FavoriteController getFavorites returns 401 Unauthorized when unauthenticated")
                void favoriteControllerGetFavoritesRejectsUnauthenticated() {
                        FavoriteController controller = new FavoriteController(favoriteService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getFavorites(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(favoriteService, never()).getFavorites(anyString());
                }

                @Test
                @DisplayName("FavoriteController addFavorite returns 401 Unauthorized when unauthenticated")
                void favoriteControllerAddFavoriteRejectsUnauthenticated() {
                        FavoriteController controller = new FavoriteController(favoriteService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller
                                        .addFavorite(null, new FavoriteDTO.AddFavoriteRequest("veh_1")));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(favoriteService, never()).addFavorite(anyString(), anyString());
                }

                @Test
                @DisplayName("FavoriteController removeFavorite returns 401 Unauthorized when unauthenticated")
                void favoriteControllerRemoveFavoriteRejectsUnauthenticated() {
                        FavoriteController controller = new FavoriteController(favoriteService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.removeFavorite(null, "veh_1", null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(favoriteService, never()).removeFavorite(anyString(), anyString());
                }

                @Test
                @DisplayName("ChatController listConversations returns 401 Unauthorized when unauthenticated")
                void chatControllerListConversationsRejectsUnauthenticated() {
                        ChatController controller = new ChatController(chatService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.listConversations(null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(chatService, never()).listConversations(anyString());
                }

                @Test
                @DisplayName("UploadController uploadPrivateDoc returns 401 Unauthorized when unauthenticated")
                void uploadControllerUploadPrivateDocRejectsUnauthenticated() {
                        UploadController controller = new UploadController(minioStorageService);
                        MockMultipartFile file = new MockMultipartFile("file", "doc.pdf", "application/pdf",
                                        new byte[] { 1, 2 });

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.uploadPrivateDoc(file, null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                }

                @Test
                @DisplayName("UploadController getPresignedUrl returns 401 Unauthorized when unauthenticated")
                void uploadControllerGetPresignedUrlRejectsUnauthenticated() {
                        UploadController controller = new UploadController(minioStorageService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.getPresignedUrl("receipts/some-receipt.jpg", null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                }

                @Test
                @DisplayName("VehicleController generateVehicleReport returns 401 Unauthorized when unauthenticated")
                void vehicleControllerGenerateVehicleReportRejectsUnauthenticated() {
                        VehicleController controller = new VehicleController(vehicleService, vehicleReportService);

                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> controller.generateVehicleReport("veh_1", null));

                        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
                        verify(vehicleReportService, never()).generateReport(anyString(), anyString());
                }

                @Test
                @DisplayName("SessionService switchPersona throws 403 Forbidden when demo mode is disabled")
                void sessionServiceSwitchPersonaRejectsWhenDemoDisabled() {
                        when(dualAuthFilter.isDemoModeEnabled()).thenReturn(false);

                        SessionService sessionService = new SessionService(
                                        userRepository, sellerProfileRepository, tenantRepository,
                                        tenantMemberRepository,
                                        subscriptionRepository, dualAuthFilter, sessionTokenService, adminService);

                        MockHttpServletResponse response = new MockHttpServletResponse();
                        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                                        () -> sessionService.switchPersona("usr_dealer_sokha", response));

                        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
                        assertTrue(ex.getReason().contains("demo mode"));
                }

                @Test
                @DisplayName("SessionService getSession does not leak demo buyer when demo mode is disabled and unauthenticated")
                void sessionServiceGetSessionDoesNotFallbackToDemoBuyer() {
                        when(dualAuthFilter.resolveUserId(any())).thenReturn(null);
                        when(adminService.getPlatformSettings()).thenReturn(AdminDTO.PlatformSettingsDTO.builder()
                                        .demoModeEnabled(false)
                                        .adminOnlyLogin(false)
                                        .build());

                        SessionService sessionService = new SessionService(
                                        userRepository, sellerProfileRepository, tenantRepository,
                                        tenantMemberRepository,
                                        subscriptionRepository, dualAuthFilter, sessionTokenService, adminService);

                        MockHttpServletRequest request = new MockHttpServletRequest();
                        SessionDTO session = sessionService.getSession(request);

                        assertFalse(session.isAuthed());
                        assertFalse(session.isDemoPersona());
                        assertFalse(session.isDemoModeEnabled());
                        assertEquals("", session.getUser().getId(),
                                        "Guest user ID must be empty string, not usr_demo_buyer");
                        assertEquals("", session.getUser().getName(), "Guest user name must be empty string, not Dara");
                }
        }
}
