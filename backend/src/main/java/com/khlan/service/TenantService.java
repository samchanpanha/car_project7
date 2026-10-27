package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.TenantDTO;
import com.khlan.dto.VehicleDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantRepository tenantRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final TenantBranchRepository tenantBranchRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final VehicleRepository vehicleRepository;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final FavoriteRepository favoriteRepository;
    private final AppointmentRepository appointmentRepository;
    private final AuditLogRepository auditLogRepository;
    private final VehicleService vehicleService;
    private final ObjectMapper objectMapper;

    public record TenantContext(UserEntity user, TenantMemberEntity member, TenantEntity tenant) {}

    public TenantContext requireTenantMember(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (Boolean.TRUE.equals(user.getIsBlacklisted())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Your account has been blacklisted: " + user.getBlacklistReason());
        }

        TenantMemberEntity member = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: not an active member of any dealership"));

        TenantEntity tenant = tenantRepository.findById(member.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dealership tenant not found"));

        if ("BLACKLISTED".equals(tenant.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Your dealership account has been blacklisted for security violations.");
        }

        return new TenantContext(user, member, tenant);
    }

    public void requireCanManage(TenantMemberEntity member) {
        if (!"OWNER".equals(member.getRole()) && !"MANAGER".equals(member.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only dealership owners or managers are authorized");
        }
    }

    @Transactional(readOnly = true)
    public TenantDTO.TenantDashboardDTO getDashboard(String userId) {
        TenantContext ctx = requireTenantMember(userId);
        TenantEntity t = ctx.tenant();

        long published = vehicleRepository.countByTenantIdAndStatus(t.getId(), "PUBLISHED");
        long pending = vehicleRepository.countByTenantIdAndStatus(t.getId(), "PENDING_REVIEW");
        long sold = vehicleRepository.countByTenantIdAndStatus(t.getId(), "SOLD");
        long draft = vehicleRepository.countByTenantIdAndStatus(t.getId(), "DRAFT");
        Long totalViews = vehicleRepository.sumViewsByTenantId(t.getId());
        long totalLeads = conversationRepository.countByTenantId(t.getId());
        long activeFavorites = favoriteRepository.countByTenantId(t.getId());
        long appointmentsRequested = appointmentRepository.countByTenantIdAndStatusNot(t.getId(), "CANCELLED");

        TenantDTO.TenantStatsDTO stats = TenantDTO.TenantStatsDTO.builder()
                .published(published)
                .pending(pending)
                .sold(sold)
                .draft(draft)
                .totalViews(totalViews != null ? totalViews : 0)
                .totalLeads(totalLeads)
                .activeFavorites(activeFavorites)
                .appointmentsRequested(appointmentsRequested)
                .build();

        TenantDTO.TenantInfoDTO info = TenantDTO.TenantInfoDTO.builder()
                .id(t.getId())
                .name(t.getName())
                .slug(t.getSlug())
                .logoUrl(t.getLogoUrl())
                .bio(t.getBio())
                .bioKm(t.getBioKm())
                .city(t.getCity())
                .address(t.getAddress())
                .phone(t.getPhone())
                .telegram(t.getTelegram())
                .verification(t.getVerification())
                .status(t.getStatus())
                .memberSince(t.getCreatedAt() != null ? t.getCreatedAt().toString() : null)
                .build();

        TenantDTO.TenantSubscriptionDTO subDTO = null;
        Optional<SubscriptionEntity> subOpt = subscriptionRepository.findById(t.getId());
        if (subOpt.isPresent()) {
            SubscriptionEntity sub = subOpt.get();
            int branchLimit = "ENTERPRISE".equalsIgnoreCase(sub.getPlan()) ? 10 : ("PRO".equalsIgnoreCase(sub.getPlan()) ? 3 : 1);
            boolean unlimitedInventory = sub.getListingsLimit() != null && sub.getListingsLimit() >= 1000;
            subDTO = TenantDTO.TenantSubscriptionDTO.builder()
                    .plan(sub.getPlan())
                    .status(sub.getStatus())
                    .currentPeriodEnd(sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd().toString() : null)
                    .featuredLimit(sub.getFeaturedLimit() != null ? sub.getFeaturedLimit() : 0)
                    .branchLimit(branchLimit)
                    .unlimitedInventory(unlimitedInventory)
                    .build();
        }

        List<TenantMemberEntity> members = tenantMemberRepository.findByTenantId(t.getId());
        List<TenantDTO.TenantMemberDTO> memberDTOs = new ArrayList<>();
        for (TenantMemberEntity m : members) {
            Optional<UserEntity> uOpt = userRepository.findById(m.getUserId());
            String name = uOpt.map(UserEntity::getName).orElse("Unknown");
            String phone = uOpt.map(UserEntity::getPhone).orElse("");
            memberDTOs.add(TenantDTO.TenantMemberDTO.builder()
                    .id(m.getId())
                    .userId(m.getUserId())
                    .name(name)
                    .phone(phone)
                    .role(m.getRole())
                    .status(m.getStatus())
                    .createdAt(m.getCreatedAt() != null ? m.getCreatedAt().toString() : null)
                    .build());
        }

        List<TenantDTO.PlanDTO> plans = List.of(
                TenantDTO.PlanDTO.builder()
                        .id("FREE").plan("FREE").name("Starter").priceUsd(0.0)
                        .priceUsdMonthly(0.0).priceUsdYearly(0.0).priceKhrMonthly(0.0).priceKhrYearly(0.0)
                        .featuredSlots(0).branchSlots(1).listingsLimit(10).featuredLimit(0).seats(1).enabled(true)
                        .features(List.of("10 Active Listings", "1 Branch Location", "Standard Support"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("PRO").plan("PRO").name("Professional Dealership").priceUsd(49.0)
                        .priceUsdMonthly(49.0).priceUsdYearly(490.0).priceKhrMonthly(200900.0).priceKhrYearly(2009000.0)
                        .featuredSlots(5).branchSlots(3).listingsLimit(50).featuredLimit(5).seats(3).enabled(true)
                        .features(List.of("50 Car Listings", "5 Featured Spots", "3 Staff Seats", "AI Vehicle Reports", "Telegram CRM Bot"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("ENTERPRISE").plan("ENTERPRISE").name("Enterprise Network").priceUsd(149.0)
                        .priceUsdMonthly(149.0).priceUsdYearly(1490.0).priceKhrMonthly(610900.0).priceKhrYearly(6109000.0)
                        .featuredSlots(20).branchSlots(10).listingsLimit(999).featuredLimit(20).seats(10).enabled(true)
                        .features(List.of("Unlimited Listings", "20 Featured Spots", "10 Staff Seats", "Priority API Access", "Dedicated Account Manager"))
                        .build()
        );

        return TenantDTO.TenantDashboardDTO.builder()
                .tenant(info)
                .myRole(ctx.member().getRole())
                .subscription(subDTO)
                .members(memberDTOs)
                .plans(plans)
                .stats(stats)
                .build();
    }

    @Transactional
    public void updateProfile(String userId, TenantDTO.UpdateTenantProfileRequest req) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());
        TenantEntity t = ctx.tenant();

        List<String> changed = new ArrayList<>();
        if (req.getName() != null && !req.getName().isBlank()) {
            t.setName(req.getName().trim());
            changed.add("name");
        }
        if (req.getBio() != null) {
            t.setBio(req.getBio());
            changed.add("bio");
        }
        if (req.getBioKm() != null) {
            t.setBioKm(req.getBioKm());
            changed.add("bioKm");
        }
        if (req.getCity() != null && !req.getCity().isBlank()) {
            t.setCity(req.getCity().trim());
            changed.add("city");
        }
        if (req.getAddress() != null) {
            t.setAddress(req.getAddress());
            changed.add("address");
        }
        if (req.getPhone() != null) {
            t.setPhone(req.getPhone());
            changed.add("phone");
        }
        if (req.getTelegram() != null) {
            t.setTelegram(req.getTelegram());
            changed.add("telegram");
        }
        if (req.getLogoUrl() != null) {
            t.setLogoUrl(req.getLogoUrl());
            changed.add("logoUrl");
        }

        tenantRepository.save(t);

        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(userId)
                    .action("TENANT_PROFILE_UPDATED")
                    .entity("Tenant")
                    .entityId(t.getId())
                    .metaJson(objectMapper.writeValueAsString(Map.of("fields", changed)))
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception ignored) {}
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getBranches(String userId) {
        TenantContext ctx = requireTenantMember(userId);
        String tenantId = ctx.tenant().getId();

        Optional<SubscriptionEntity> subOpt = subscriptionRepository.findById(tenantId);
        String plan = subOpt.filter(s -> "ACTIVE".equals(s.getStatus())).map(SubscriptionEntity::getPlan).orElse("FREE");
        boolean isPro = "PRO".equalsIgnoreCase(plan) || "ENTERPRISE".equalsIgnoreCase(plan);

        List<TenantBranchEntity> rows = tenantBranchRepository.findByTenantId(tenantId);
        rows.sort((a, b) -> {
            int compMain = Boolean.compare(Boolean.TRUE.equals(b.getIsMain()), Boolean.TRUE.equals(a.getIsMain()));
            if (compMain != 0) return compMain;
            return a.getCreatedAt().compareTo(b.getCreatedAt());
        });

        List<TenantDTO.TenantBranchDTO> branches = new ArrayList<>();
        for (TenantBranchEntity b : rows) {
            long count = vehicleRepository.countByBranchId(b.getId());
            branches.add(TenantDTO.TenantBranchDTO.builder()
                    .id(b.getId())
                    .tenantId(b.getTenantId())
                    .name(b.getName())
                    .nameKm(b.getNameKm())
                    .city(b.getCity())
                    .district(b.getDistrict())
                    .address(b.getAddress())
                    .phone(b.getPhone())
                    .telegram(b.getTelegram())
                    .isMain(Boolean.TRUE.equals(b.getIsMain()))
                    .status(b.getStatus())
                    .openingHours(b.getOpeningHours())
                    .imageUrl(b.getImageUrl())
                    .vehicleCount((int) count)
                    .createdAt(b.getCreatedAt() != null ? b.getCreatedAt().toString() : null)
                    .build());
        }

        return Map.of(
                "branches", branches,
                "canAddMore", isPro,
                "plan", plan,
                "isPro", isPro
        );
    }

    @Transactional
    public TenantDTO.TenantBranchDTO createBranch(String userId, TenantDTO.CreateBranchRequest req) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());
        String tenantId = ctx.tenant().getId();

        if (req.getName() == null || req.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Branch name is required");
        }
        if (req.getAddress() == null || req.getAddress().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Address is required");
        }

        List<TenantBranchEntity> existing = tenantBranchRepository.findByTenantId(tenantId);
        boolean isMain = existing.isEmpty() || Boolean.TRUE.equals(req.getIsMain());

        if (isMain) {
            for (TenantBranchEntity b : existing) {
                b.setIsMain(false);
                tenantBranchRepository.save(b);
            }
        }

        String branchId = "br_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        TenantBranchEntity branch = TenantBranchEntity.builder()
                .id(branchId)
                .tenantId(tenantId)
                .name(req.getName().trim())
                .nameKm(req.getNameKm())
                .city(req.getCity() != null ? req.getCity().trim() : "Phnom Penh")
                .district(req.getDistrict())
                .address(req.getAddress().trim())
                .phone(req.getPhone())
                .telegram(req.getTelegram())
                .isMain(isMain)
                .status(req.getStatus() != null ? req.getStatus() : "ACTIVE")
                .openingHours(req.getOpeningHours())
                .imageUrl(req.getImageUrl())
                .createdAt(OffsetDateTime.now())
                .build();

        tenantBranchRepository.save(branch);

        return TenantDTO.TenantBranchDTO.builder()
                .id(branch.getId())
                .tenantId(branch.getTenantId())
                .name(branch.getName())
                .nameKm(branch.getNameKm())
                .city(branch.getCity())
                .district(branch.getDistrict())
                .address(branch.getAddress())
                .phone(branch.getPhone())
                .telegram(branch.getTelegram())
                .isMain(branch.getIsMain())
                .status(branch.getStatus())
                .openingHours(branch.getOpeningHours())
                .imageUrl(branch.getImageUrl())
                .vehicleCount(0)
                .createdAt(branch.getCreatedAt().toString())
                .build();
    }

    @Transactional
    public TenantDTO.TenantBranchDTO updateBranch(String userId, String branchId, TenantDTO.UpdateBranchRequest req) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());
        String tenantId = ctx.tenant().getId();

        TenantBranchEntity branch = tenantBranchRepository.findById(branchId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found"));

        if (!branch.getTenantId().equals(tenantId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found in your dealership");
        }

        if (req.getName() != null && !req.getName().isBlank()) {
            branch.setName(req.getName().trim());
        }
        if (req.getNameKm() != null) {
            branch.setNameKm(req.getNameKm().trim());
        }
        if (req.getCity() != null && !req.getCity().isBlank()) {
            branch.setCity(req.getCity().trim());
        }
        if (req.getDistrict() != null) {
            branch.setDistrict(req.getDistrict().trim());
        }
        if (req.getAddress() != null && !req.getAddress().isBlank()) {
            branch.setAddress(req.getAddress().trim());
        }
        if (req.getPhone() != null) {
            branch.setPhone(req.getPhone().trim());
        }
        if (req.getTelegram() != null) {
            branch.setTelegram(req.getTelegram().trim());
        }
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            branch.setStatus(req.getStatus().trim());
        }
        if (req.getOpeningHours() != null) {
            branch.setOpeningHours(req.getOpeningHours().trim());
        }
        if (req.getImageUrl() != null) {
            branch.setImageUrl(req.getImageUrl().trim());
        }
        if (Boolean.TRUE.equals(req.getIsMain())) {
            List<TenantBranchEntity> allBranches = tenantBranchRepository.findByTenantId(tenantId);
            for (TenantBranchEntity b : allBranches) {
                if (!b.getId().equals(branchId) && Boolean.TRUE.equals(b.getIsMain())) {
                    b.setIsMain(false);
                    tenantBranchRepository.save(b);
                }
            }
            branch.setIsMain(true);
        } else if (Boolean.FALSE.equals(req.getIsMain())) {
            branch.setIsMain(false);
        }

        tenantBranchRepository.save(branch);

        long count = vehicleRepository.countByBranchId(branch.getId());
        return TenantDTO.TenantBranchDTO.builder()
                .id(branch.getId())
                .tenantId(branch.getTenantId())
                .name(branch.getName())
                .nameKm(branch.getNameKm())
                .city(branch.getCity())
                .district(branch.getDistrict())
                .address(branch.getAddress())
                .phone(branch.getPhone())
                .telegram(branch.getTelegram())
                .isMain(Boolean.TRUE.equals(branch.getIsMain()))
                .status(branch.getStatus())
                .openingHours(branch.getOpeningHours())
                .imageUrl(branch.getImageUrl())
                .vehicleCount((int) count)
                .createdAt(branch.getCreatedAt() != null ? branch.getCreatedAt().toString() : null)
                .build();
    }

    @Transactional
    public void deleteBranch(String userId, String branchId) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());

        TenantBranchEntity branch = tenantBranchRepository.findById(branchId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found"));

        if (!branch.getTenantId().equals(ctx.tenant().getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found in your dealership");
        }

        // Unlink vehicles
        List<VehicleEntity> vehicles = vehicleRepository.findByBranchId(branchId);
        for (VehicleEntity v : vehicles) {
            v.setBranchId(null);
            vehicleRepository.save(v);
        }

        tenantBranchRepository.delete(branch);
    }

    @Transactional(readOnly = true)
    public List<TenantDTO.TenantMemberDTO> getStaff(String userId) {
        TenantContext ctx = requireTenantMember(userId);
        List<TenantMemberEntity> members = tenantMemberRepository.findByTenantId(ctx.tenant().getId());

        List<TenantDTO.TenantMemberDTO> dtos = new ArrayList<>();
        for (TenantMemberEntity m : members) {
            Optional<UserEntity> u = userRepository.findById(m.getUserId());
            dtos.add(TenantDTO.TenantMemberDTO.builder()
                    .id(m.getId())
                    .userId(m.getUserId())
                    .name(u.map(UserEntity::getName).orElse("Unknown"))
                    .phone(u.map(UserEntity::getPhone).orElse(""))
                    .role(m.getRole())
                    .status(m.getStatus())
                    .createdAt(m.getCreatedAt() != null ? m.getCreatedAt().toString() : null)
                    .build());
        }
        return dtos;
    }

    @Transactional
    public TenantDTO.TenantMemberDTO inviteStaff(String userId, TenantDTO.InviteStaffRequest req) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());
        String tenantId = ctx.tenant().getId();

        if (req.getPhone() == null || req.getPhone().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phone number is required");
        }

        UserEntity user = userRepository.findByPhone(req.getPhone().trim())
                .orElseGet(() -> {
                    String uid = "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
                    UserEntity newUser = UserEntity.builder()
                            .id(uid)
                            .phone(req.getPhone().trim())
                            .name(req.getName() != null ? req.getName().trim() : "Staff Member")
                            .role("DEALER")
                            .phoneVerified(false)
                            .build();
                    return userRepository.save(newUser);
                });

        Optional<TenantMemberEntity> existingMembership = tenantMemberRepository.findByTenantIdAndUserId(tenantId, user.getId());
        TenantMemberEntity member;
        if (existingMembership.isPresent()) {
            member = existingMembership.get();
            if ("OWNER".equals(member.getRole())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The dealership owner cannot be re-invited");
            }
            member.setRole(req.getRole() != null ? req.getRole() : "SALES_STAFF");
        } else {
            String mid = "tm_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            member = TenantMemberEntity.builder()
                    .id(mid)
                    .tenantId(tenantId)
                    .userId(user.getId())
                    .role(req.getRole() != null ? req.getRole() : "SALES_STAFF")
                    .status("ACTIVE")
                    .createdAt(OffsetDateTime.now())
                    .build();
        }
        tenantMemberRepository.save(member);

        return TenantDTO.TenantMemberDTO.builder()
                .id(member.getId())
                .userId(user.getId())
                .name(user.getName())
                .phone(user.getPhone())
                .role(member.getRole())
                .status(member.getStatus())
                .createdAt(member.getCreatedAt().toString())
                .build();
    }

    @Transactional
    public TenantDTO.TenantMemberDTO updateStaff(String userId, String memberId, TenantDTO.UpdateStaffRequest req) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());
        String tenantId = ctx.tenant().getId();

        TenantMemberEntity member = tenantMemberRepository.findById(memberId)
                .or(() -> tenantMemberRepository.findByTenantIdAndUserId(tenantId, memberId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Staff member not found"));

        if (!member.getTenantId().equals(tenantId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Staff member not found in your dealership");
        }

        if ("OWNER".equals(member.getRole()) && req.getRole() != null && !"OWNER".equalsIgnoreCase(req.getRole())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot change role of dealership owner");
        }

        if (req.getRole() != null && !req.getRole().isBlank()) {
            member.setRole(req.getRole().trim());
        }
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            member.setStatus(req.getStatus().trim());
        }
        tenantMemberRepository.save(member);

        Optional<UserEntity> u = userRepository.findById(member.getUserId());
        return TenantDTO.TenantMemberDTO.builder()
                .id(member.getId())
                .userId(member.getUserId())
                .name(u.map(UserEntity::getName).orElse("Unknown"))
                .phone(u.map(UserEntity::getPhone).orElse(""))
                .role(member.getRole())
                .status(member.getStatus())
                .createdAt(member.getCreatedAt() != null ? member.getCreatedAt().toString() : null)
                .build();
    }

    @Transactional
    public void removeStaff(String userId, String memberId) {
        TenantContext ctx = requireTenantMember(userId);
        requireCanManage(ctx.member());
        String tenantId = ctx.tenant().getId();

        TenantMemberEntity member = tenantMemberRepository.findById(memberId)
                .or(() -> tenantMemberRepository.findByTenantIdAndUserId(tenantId, memberId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Staff member not found"));

        if (!member.getTenantId().equals(tenantId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Staff member not found in your dealership");
        }

        if ("OWNER".equals(member.getRole())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot remove dealership owner");
        }

        tenantMemberRepository.delete(member);
    }

    @Transactional(readOnly = true)
    public List<TenantDTO.TenantLeadDTO> getLeads(String userId) {
        TenantContext ctx = requireTenantMember(userId);
        String tenantId = ctx.tenant().getId();

        List<ConversationEntity> convs = conversationRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId);
        List<TenantDTO.TenantLeadDTO> leads = new ArrayList<>();

        for (ConversationEntity c : convs) {
            Optional<VehicleEntity> vOpt = vehicleRepository.findById(c.getVehicleId());
            if (vOpt.isEmpty()) continue;
            VehicleEntity v = vOpt.get();

            Optional<UserEntity> bOpt = userRepository.findById(c.getBuyerId());
            String buyerName = bOpt.map(UserEntity::getName).orElse("Buyer");

            Optional<MessageEntity> lastMsgOpt = messageRepository.findFirstByConversationIdOrderByCreatedAtDesc(c.getId());
            long msgCount = messageRepository.countByConversationId(c.getId());

            String thumb = (v.getImages() != null && !v.getImages().isEmpty())
                    ? v.getImages().get(0).getUrl()
                    : null;

            TenantDTO.LeadMessageDTO lastMsg = lastMsgOpt.map(m -> TenantDTO.LeadMessageDTO.builder()
                    .body(m.getBody())
                    .createdAt(m.getCreatedAt() != null ? m.getCreatedAt().toString() : null)
                    .isMine(userId.equals(m.getSenderId()))
                    .build()).orElse(null);

            leads.add(TenantDTO.TenantLeadDTO.builder()
                    .conversationId(c.getId())
                    .vehicle(TenantDTO.LeadVehicleDTO.builder()
                            .id(v.getId())
                            .make(v.getMake())
                            .model(v.getModel())
                            .year(v.getYear())
                            .priceUsd(v.getPriceUsd())
                            .thumbnail(thumb)
                            .build())
                    .buyer(TenantDTO.LeadBuyerDTO.builder()
                            .id(c.getBuyerId())
                            .name(buyerName)
                            .build())
                    .lastMessage(lastMsg)
                    .messageCount(msgCount)
                    .updatedAt(c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null)
                    .build());
        }

        return leads;
    }

    @Transactional(readOnly = true)
    public TenantDTO.PublicSellerDTO getPublicSeller(String sellerId) {
        UserEntity seller = userRepository.findById(sellerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Seller not found"));

        VehicleDTO.SellerFullDTO fullDTO = vehicleService.getSellerFull(seller.getId());
        if (fullDTO == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Seller profile not found");
        }

        List<VehicleEntity> vehicles = vehicleRepository.findBySellerIdAndStatusInOrderByCreatedAtDesc(
                sellerId, List.of("PUBLISHED", "SOLD")
        );
        List<VehicleDTO.VehicleCardDTO> cards = vehicles.stream().map(vehicleService::toCardDTO).toList();

        return TenantDTO.PublicSellerDTO.builder()
                .seller(fullDTO)
                .listings(cards)
                .build();
    }

    @Transactional
    public void downgradeOrSetFreeSubscription(String userId) {
        TenantContext ctx = requireTenantMember(userId);
        if (!"OWNER".equals(ctx.member.getRole()) && !"ADMIN".equals(ctx.member.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: only owners or admins can manage subscriptions");
        }

        SubscriptionEntity sub = subscriptionRepository.findByTenantId(ctx.tenant.getId())
                .orElseGet(() -> SubscriptionEntity.builder()
                        .id("sub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                        .tenantId(ctx.tenant.getId())
                        .build());

        sub.setPlan("FREE");
        sub.setStatus("ACTIVE");
        sub.setBillingCycle("MONTHLY");
        sub.setPriceUsd(0.0);
        sub.setListingsLimit(10);
        sub.setFeaturedLimit(0);
        sub.setSeats(1);
        sub.setCurrentPeriodEnd(OffsetDateTime.now().plusMonths(1));
        if (sub.getStartedAt() == null) {
            sub.setStartedAt(OffsetDateTime.now());
        }

        subscriptionRepository.save(sub);
    }
}
