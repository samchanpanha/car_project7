package com.khlan.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.AccountDTO;
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
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class AccountService {

    private final UserRepository userRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final FavoriteRepository favoriteRepository;
    private final SavedSearchRepository savedSearchRepository;
    private final AppointmentRepository appointmentRepository;
    private final ConversationRepository conversationRepository;
    private final VehicleHistoryReportRepository vehicleHistoryReportRepository;
    private final VehicleRepository vehicleRepository;
    private final AuditLogRepository auditLogRepository;
    private final VehicleService vehicleService;
    private final PasswordService passwordService;
    private final ObjectMapper objectMapper;

    private static final int MAX_SAVED_SEARCHES = 20;
    private static final Pattern PHONE_PATTERN = Pattern.compile("^\\+855\\d{7,9}$");

    @Transactional(readOnly = true)
    public Map<String, Object> getProfile(String userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("id", user.getId());
        res.put("name", user.getName());
        res.put("phone", user.getPhone());
        res.put("email", user.getEmail());
        res.put("role", user.getRole());
        res.put("locale", user.getLocale());
        res.put("avatarUrl", user.getAvatarUrl());
        res.put("phoneVerified", Boolean.TRUE.equals(user.getPhoneVerified()));
        res.put("createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : null);

        sellerProfileRepository.findById(userId).ifPresent(sp -> {
            Map<String, Object> sellerMap = new LinkedHashMap<>();
            sellerMap.put("shopName", sp.getShopName());
            sellerMap.put("type", sp.getType());
            sellerMap.put("bio", sp.getBio());
            sellerMap.put("city", sp.getCity());
            sellerMap.put("address", sp.getAddress());
            sellerMap.put("verification", sp.getVerification());
            res.put("sellerProfile", sellerMap);
        });

        return res;
    }

    @Transactional
    public Map<String, Object> updateProfile(String userId, AccountDTO.UpdateProfileRequest req) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        List<String> changedFields = new ArrayList<>();

        if (req.getName() != null && !req.getName().isBlank()) {
            user.setName(req.getName().trim());
            changedFields.add("name");
        }

        if (req.getLocale() != null && !req.getLocale().isBlank()) {
            user.setLocale(req.getLocale().trim());
            changedFields.add("locale");
        }

        if (req.getAvatarUrl() != null) {
            user.setAvatarUrl(req.getAvatarUrl().isBlank() ? null : req.getAvatarUrl().trim());
            changedFields.add("avatarUrl");
        }

        if (req.getPhone() != null && !req.getPhone().isBlank() && !req.getPhone().equals(user.getPhone())) {
            String newPhone = req.getPhone().trim();
            if (!PHONE_PATTERN.matcher(newPhone).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phone number must match Cambodian format (+855XXXXXXXX)");
            }
            if (userRepository.existsByPhone(newPhone)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This phone number is already in use");
            }
            user.setPhone(newPhone);
            user.setPhoneVerified(false);
            changedFields.add("phone");
        }

        userRepository.save(user);

        // Audit Log
        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(userId)
                    .action("PROFILE_UPDATED")
                    .entity("User")
                    .entityId(userId)
                    .metaJson(objectMapper.writeValueAsString(Map.of("fields", changedFields)))
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception e) {
            log.warn("Failed to write audit log for profile update: {}", e.getMessage());
        }

        Map<String, Object> updatedUser = new LinkedHashMap<>();
        updatedUser.put("id", user.getId());
        updatedUser.put("name", user.getName());
        updatedUser.put("locale", user.getLocale());
        updatedUser.put("avatarUrl", user.getAvatarUrl());
        updatedUser.put("phone", user.getPhone());
        updatedUser.put("phoneVerified", user.getPhoneVerified());

        return Map.of("ok", true, "user", updatedUser);
    }

    @Transactional
    public void changePassword(String userId, AccountDTO.ChangePasswordRequest req) {
        if (req.getNewPassword() == null || req.getNewPassword().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "password must be at least 8 characters");
        }

        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
            if (req.getCurrentPassword() == null || !passwordService.matches(req.getCurrentPassword(), user.getPasswordHash())) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
            }
        }

        user.setPasswordHash(passwordService.encode(req.getNewPassword()));
        userRepository.save(user);

        // Audit Log
        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(userId)
                    .action("PASSWORD_CHANGED")
                    .entity("User")
                    .entityId(userId)
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception e) {
            log.warn("Failed to write audit log for password change: {}", e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public AccountDTO.AccountOverviewDTO getOverview(String userId) {
        long favorites = favoriteRepository.countByUserId(userId);
        long savedSearches = savedSearchRepository.countByUserId(userId);
        long appointments = appointmentRepository.countByBuyerIdAndStatusNot(userId, "CANCELLED");
        long reportsGenerated = vehicleHistoryReportRepository.countByRequestedBy(userId);
        long messagesCount = conversationRepository.countByBuyerId(userId);

        List<VehicleHistoryReportEntity> reports = vehicleHistoryReportRepository.findByRequestedByOrderByCreatedAtDesc(userId);
        // Sort COMPLETE first, then by date desc
        reports.sort((a, b) -> {
            int compA = "COMPLETE".equals(a.getStatus()) ? 1 : 0;
            int compB = "COMPLETE".equals(b.getStatus()) ? 1 : 0;
            if (compA != compB) return Integer.compare(compB, compA);
            return b.getCreatedAt().compareTo(a.getCreatedAt());
        });

        List<AccountDTO.RecentReportDTO> recentReports = new ArrayList<>();
        int count = Math.min(5, reports.size());
        for (int i = 0; i < count; i++) {
            VehicleHistoryReportEntity r = reports.get(i);
            String vehicleLabel = "Vehicle " + r.getVehicleId();
            Optional<VehicleEntity> vehOpt = vehicleRepository.findById(r.getVehicleId());
            if (vehOpt.isPresent()) {
                VehicleEntity v = vehOpt.get();
                vehicleLabel = String.format("%s %s %d", v.getMake(), v.getModel(), v.getYear());
            }

            recentReports.add(AccountDTO.RecentReportDTO.builder()
                    .id(r.getId())
                    .vehicleId(r.getVehicleId())
                    .vehicleLabel(vehicleLabel)
                    .confidence((int) Math.round(r.getOverallConfidence()))
                    .createdAt(r.getCreatedAt() != null ? r.getCreatedAt().toString() : OffsetDateTime.now().toString())
                    .build());
        }

        return AccountDTO.AccountOverviewDTO.builder()
                .favorites(favorites)
                .savedSearches(savedSearches)
                .appointments(appointments)
                .reportsGenerated(reportsGenerated)
                .messagesCount(messagesCount)
                .recentReports(recentReports)
                .build();
    }

    @Transactional(readOnly = true)
    public List<AccountDTO.SavedSearchDTO> getSavedSearches(String userId) {
        List<SavedSearchEntity> rows = savedSearchRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<AccountDTO.SavedSearchDTO> result = new ArrayList<>();

        for (SavedSearchEntity row : rows) {
            Map<String, Object> queryMap = safeParseQuery(row.getQueryJson());
            result.add(AccountDTO.SavedSearchDTO.builder()
                    .id(row.getId())
                    .name(row.getName())
                    .query(queryMap)
                    .alertsEnabled(Boolean.TRUE.equals(row.getAlertsEnabled()))
                    .createdAt(row.getCreatedAt() != null ? row.getCreatedAt().toString() : OffsetDateTime.now().toString())
                    .build());
        }

        return result;
    }

    @Transactional
    public AccountDTO.SavedSearchDTO createSavedSearch(String userId, AccountDTO.CreateSavedSearchRequest req) {
        if (req.getName() == null || req.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }

        long count = savedSearchRepository.countByUserId(userId);
        if (count >= MAX_SAVED_SEARCHES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Saved search limit reached (max " + MAX_SAVED_SEARCHES + ")");
        }

        String queryJson;
        try {
            queryJson = req.getQuery() != null ? objectMapper.writeValueAsString(req.getQuery()) : "{}";
        } catch (Exception e) {
            queryJson = "{}";
        }

        String searchId = "srch_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        SavedSearchEntity savedSearch = SavedSearchEntity.builder()
                .id(searchId)
                .userId(userId)
                .name(req.getName().trim())
                .queryJson(queryJson)
                .alertsEnabled(Boolean.TRUE.equals(req.getAlertsEnabled()))
                .createdAt(OffsetDateTime.now())
                .build();

        savedSearchRepository.save(savedSearch);

        return AccountDTO.SavedSearchDTO.builder()
                .id(searchId)
                .name(savedSearch.getName())
                .query(req.getQuery() != null ? req.getQuery() : Map.of())
                .alertsEnabled(savedSearch.getAlertsEnabled())
                .createdAt(savedSearch.getCreatedAt().toString())
                .build();
    }

    @Transactional
    public void deleteSavedSearch(String userId, String id) {
        SavedSearchEntity search = savedSearchRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved search not found"));
        savedSearchRepository.delete(search);
    }

    @Transactional(readOnly = true)
    public AccountDTO.RunSavedSearchResponse runSavedSearch(String userId, String id) {
        SavedSearchEntity search = savedSearchRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved search not found"));

        Map<String, Object> q = safeParseQuery(search.getQueryJson());

        String make = (String) q.get("make");
        String model = (String) q.get("model");
        String city = (String) q.get("city");
        String bodyType = (String) q.get("bodyType");
        String fuel = (String) q.get("fuel");
        String transmission = (String) q.get("transmission");
        String drivetrain = (String) q.get("drivetrain");
        String condition = (String) q.get("condition");
        Double minPrice = q.get("minPrice") != null ? Double.valueOf(q.get("minPrice").toString()) : (q.get("priceMin") != null ? Double.valueOf(q.get("priceMin").toString()) : null);
        Double maxPrice = q.get("maxPrice") != null ? Double.valueOf(q.get("maxPrice").toString()) : (q.get("priceMax") != null ? Double.valueOf(q.get("priceMax").toString()) : null);
        Integer minYear = q.get("minYear") != null ? Integer.valueOf(q.get("minYear").toString()) : (q.get("yearMin") != null ? Integer.valueOf(q.get("yearMin").toString()) : null);
        Integer maxYear = q.get("maxYear") != null ? Integer.valueOf(q.get("maxYear").toString()) : (q.get("yearMax") != null ? Integer.valueOf(q.get("yearMax").toString()) : null);
        Integer minMileage = q.get("minMileage") != null ? Integer.valueOf(q.get("minMileage").toString()) : null;
        Integer maxMileage = q.get("maxMileage") != null ? Integer.valueOf(q.get("maxMileage").toString()) : (q.get("mileageMax") != null ? Integer.valueOf(q.get("mileageMax").toString()) : null);
        Boolean featured = q.get("featured") != null ? Boolean.valueOf(q.get("featured").toString()) : null;
        String sellerId = (String) q.get("sellerId");
        String dealerId = (String) q.get("dealerId");
        String keyword = (String) q.get("q");
        String listingCategory = (String) q.getOrDefault("listingCategory", q.get("category"));
        String partCategory = (String) q.get("partCategory");
        String partTarget = (String) q.get("partTarget");
        String sort = (String) q.get("sort");

        VehicleDTO.PagedVehiclesResponseDTO paged = vehicleService.searchVehicles(
                keyword, make, model, city, listingCategory, partCategory, partTarget, bodyType, fuel, transmission, drivetrain, condition,
                minPrice, maxPrice, minYear, maxYear, minMileage, maxMileage, featured, sellerId, dealerId,
                sort, 1, 12
        );

        return AccountDTO.RunSavedSearchResponse.builder()
                .total(paged.getTotal())
                .vehicles(paged.getVehicles())
                .items(paged.getVehicles())
                .build();
    }

    private Map<String, Object> safeParseQuery(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }
}
