package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionDTO {

    private AuthDTO.UserSummaryDTO user;
    private String sellerType; // "DEALER" | "PRIVATE" | null
    private TenantSummary tenant;
    private boolean authed;
    private boolean telegramLinked;
    private boolean phoneVerified;
    private List<PersonaDTO> personas;
    private SubscriptionSummary subscription;
    /** True when the current request is using a demo persona (not a real auth session). */
    private boolean demoPersona;
    /** Whether the platform demo mode is enabled (allows persona switching). */
    private boolean demoModeEnabled;
    /** When true, only admins can log in. */
    private boolean adminOnlyLogin;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantSummary {
        private String id;
        private String name;
        private String slug;
        private String logoUrl;
        private String myRole;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PersonaDTO {
        private String id;
        private String name;
        private String role;
        private Map<String, String> label;
        private String tag;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SubscriptionSummary {
        private String plan;
        private String status;
        private boolean isTrial;
        private String currentPeriodEnd;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SwitchPersonaRequest {
        private String userId;
    }
}
