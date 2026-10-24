package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.TenantInventoryDTO;
import com.khlan.dto.VehicleDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantInventoryService {

    private final VehicleRepository vehicleRepository;
    private final VehicleService vehicleService;
    private final SubscriptionRepository subscriptionRepository;
    private final TenantBranchRepository tenantBranchRepository;
    private final ConversationRepository conversationRepository;
    private final AppointmentRepository appointmentRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public Object getInventory(String tenantId, String status, String branchId, String q,
                               Double priceMin, Double priceMax, String sort,
                               Integer page, Integer limit) {
        Specification<VehicleEntity> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("tenantId"), tenantId));

            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (branchId != null && !branchId.isBlank()) {
                predicates.add(cb.equal(root.get("branchId"), branchId));
            }
            if (priceMin != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("priceUsd"), priceMin));
            }
            if (priceMax != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("priceUsd"), priceMax));
            }
            if (q != null && !q.isBlank()) {
                String pattern = "%" + q.toLowerCase().trim() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("make")), pattern),
                        cb.like(cb.lower(root.get("model")), pattern),
                        cb.like(cb.lower(root.get("vinLast6")), pattern),
                        cb.like(cb.lower(root.get("plateNo")), pattern)
                ));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Sort sortObj = Sort.by(Sort.Direction.DESC, "createdAt");
        if ("price_asc".equalsIgnoreCase(sort)) sortObj = Sort.by(Sort.Direction.ASC, "priceUsd");
        else if ("price_desc".equalsIgnoreCase(sort)) sortObj = Sort.by(Sort.Direction.DESC, "priceUsd");
        else if ("views".equalsIgnoreCase(sort)) sortObj = Sort.by(Sort.Direction.DESC, "views");
        else if ("year_desc".equalsIgnoreCase(sort)) sortObj = Sort.by(Sort.Direction.DESC, "year");

        if (page != null) {
            int pageIndex = Math.max(0, page - 1);
            int pageSize = limit != null ? Math.min(100, Math.max(1, limit)) : 20;
            Page<VehicleEntity> pageResult = vehicleRepository.findAll(spec, PageRequest.of(pageIndex, pageSize, sortObj));

            List<VehicleDTO.VehicleCardDTO> cards = pageResult.getContent().stream()
                    .map(vehicleService::toCardDTO)
                    .collect(Collectors.toList());

            int pageCount = Math.max(1, (int) Math.ceil((double) pageResult.getTotalElements() / pageSize));
            return TenantInventoryDTO.PagedInventoryResponse.builder()
                    .items(cards)
                    .total(pageResult.getTotalElements())
                    .page(pageIndex + 1)
                    .limit(pageSize)
                    .pageCount(pageCount)
                    .build();
        }

        // Unpaged behavior
        List<VehicleEntity> vehicles = vehicleRepository.findAll(spec, PageRequest.of(0, 500, sortObj)).getContent();
        return vehicles.stream().map(vehicleService::toCardDTO).collect(Collectors.toList());
    }

    @Transactional
    public void patchVehicle(String tenantId, String memberUserId, String memberRole,
                             String vehicleId, TenantInventoryDTO.PatchInventoryVehicleRequest req) {
        // Role check
        if (!isAuthorizedToWrite(memberRole)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: insufficient permissions");
        }

        VehicleEntity vehicle = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        if (!tenantId.equals(vehicle.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found in this tenant");
        }

        // Featured limit check
        if (Boolean.TRUE.equals(req.getFeatured()) && !Boolean.TRUE.equals(vehicle.getFeatured())) {
            SubscriptionEntity sub = subscriptionRepository.findByTenantId(tenantId).orElse(null);
            int featuredLimit = sub != null && sub.getFeaturedLimit() != null ? sub.getFeaturedLimit() : 0;
            long featuredCount = vehicleRepository.findByTenantId(tenantId).stream()
                    .filter(v -> Boolean.TRUE.equals(v.getFeatured()) && !v.getId().equals(vehicleId))
                    .count();
            if (featuredCount >= featuredLimit) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Featured limit reached for your plan");
            }
        }

        String oldStatus = vehicle.getStatus();
        Double oldPrice = vehicle.getPriceUsd();
        Boolean oldFeatured = vehicle.getFeatured();

        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            vehicle.setStatus(req.getStatus());
        }
        if (req.getPriceUsd() != null && req.getPriceUsd() > 0) {
            vehicle.setPriceUsd(req.getPriceUsd());
        }
        if (req.getFeatured() != null) {
            vehicle.setFeatured(req.getFeatured());
        }
        if (req.getBranchId() != null) {
            vehicle.setBranchId(req.getBranchId().isBlank() ? null : req.getBranchId());
        }

        vehicleRepository.save(vehicle);

        // Audit logs
        if (req.getStatus() != null && !req.getStatus().equals(oldStatus)) {
            recordAudit(memberUserId, "LISTING_STATUS_CHANGED", "Vehicle", vehicleId,
                    Map.of("from", oldStatus, "to", req.getStatus()));
        }
        if (req.getPriceUsd() != null && !req.getPriceUsd().equals(oldPrice)) {
            recordAudit(memberUserId, "LISTING_PRICE_UPDATED", "Vehicle", vehicleId,
                    Map.of("from", oldPrice, "to", req.getPriceUsd()));
        }
        if (req.getFeatured() != null && !req.getFeatured().equals(oldFeatured)) {
            recordAudit(memberUserId, Boolean.TRUE.equals(req.getFeatured()) ? "LISTING_FEATURED" : "LISTING_UNFEATURED",
                    "Vehicle", vehicleId, Map.of("from", oldFeatured, "to", req.getFeatured()));
        }
    }

    @Transactional(readOnly = true)
    public TenantInventoryDTO.TenantAnalyticsResponse getAnalytics(String tenantId, int days) {
        int safeDays = Math.min(365, Math.max(7, days));
        OffsetDateTime sinceDate = OffsetDateTime.now().minusDays(safeDays);

        List<VehicleEntity> vehicles = vehicleRepository.findByTenantId(tenantId);
        long totalListings = vehicles.size();
        double totalInventoryValue = vehicles.stream().mapToDouble(VehicleEntity::getPriceUsd).sum();
        double avgPrice = totalListings > 0 ? totalInventoryValue / totalListings : 0.0;
        long totalViews = vehicles.stream().mapToLong(VehicleEntity::getViews).sum();

        // Leads (conversations) for this tenant
        List<String> vehicleIds = vehicles.stream().map(VehicleEntity::getId).toList();
        List<ConversationEntity> conversations = vehicleIds.isEmpty() ? List.of()
                : conversationRepository.findAll().stream()
                .filter(c -> vehicleIds.contains(c.getVehicleId()) && c.getCreatedAt().isAfter(sinceDate))
                .toList();
        long totalLeads = conversations.size();

        // Appointments for this tenant
        List<AppointmentEntity> appointments = appointmentRepository.findByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .filter(a -> a.getCreatedAt().isAfter(sinceDate))
                .toList();
        long appointmentCount = appointments.size();

        double conversionRate = totalLeads > 0 ? ((double) appointmentCount / totalLeads) * 100.0 : 0.0;

        // Status breakdown
        Map<String, List<VehicleEntity>> byStatus = vehicles.stream()
                .collect(Collectors.groupingBy(VehicleEntity::getStatus));
        List<TenantInventoryDTO.StatusCount> statusBreakdown = byStatus.entrySet().stream()
                .map(e -> TenantInventoryDTO.StatusCount.builder()
                        .status(e.getKey())
                        .count(e.getValue().size())
                        .value(e.getValue().stream().mapToDouble(VehicleEntity::getPriceUsd).sum())
                        .build())
                .collect(Collectors.toList());

        // Body type breakdown
        Map<String, Long> byBodyType = vehicles.stream()
                .collect(Collectors.groupingBy(v -> v.getBodyType() != null ? v.getBodyType() : "OTHER", Collectors.counting()));
        List<TenantInventoryDTO.BodyTypeCount> bodyTypeBreakdown = byBodyType.entrySet().stream()
                .map(e -> TenantInventoryDTO.BodyTypeCount.builder()
                        .type(e.getKey())
                        .count(e.getValue())
                        .build())
                .collect(Collectors.toList());

        // Branch breakdown
        List<TenantBranchEntity> branches = tenantBranchRepository.findByTenantIdOrderByCreatedAtAsc(tenantId);
        List<TenantInventoryDTO.BranchBreakdownEntry> branchBreakdown = branches.stream().map(b -> {
            List<VehicleEntity> branchVehicles = vehicles.stream()
                    .filter(v -> b.getId().equals(v.getBranchId()))
                    .toList();
            long branchViews = branchVehicles.stream().mapToLong(VehicleEntity::getViews).sum();
            List<String> branchVehicleIds = branchVehicles.stream().map(VehicleEntity::getId).toList();
            long branchLeads = conversations.stream().filter(c -> branchVehicleIds.contains(c.getVehicleId())).count();

            return TenantInventoryDTO.BranchBreakdownEntry.builder()
                    .branchId(b.getId())
                    .name(b.getName())
                    .count(branchVehicles.size())
                    .views(branchViews)
                    .leads(branchLeads)
                    .build();
        }).collect(Collectors.toList());

        // Timeline (last safeDays)
        List<TenantInventoryDTO.TimelineEntry> timeline = new ArrayList<>();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        LocalDate today = LocalDate.now();
        for (int i = safeDays - 1; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            String dateStr = d.format(fmt);
            timeline.add(TenantInventoryDTO.TimelineEntry.builder()
                    .date(dateStr)
                    .views(totalViews / safeDays)
                    .leads(conversations.stream().filter(c -> c.getCreatedAt().toLocalDate().isEqual(d)).count())
                    .appointments(appointments.stream().filter(a -> a.getCreatedAt().toLocalDate().isEqual(d)).count())
                    .build());
        }

        TenantInventoryDTO.AnalyticsSummary summary = TenantInventoryDTO.AnalyticsSummary.builder()
                .totalInventoryValue(Math.round(totalInventoryValue * 100.0) / 100.0)
                .avgPrice(Math.round(avgPrice * 100.0) / 100.0)
                .totalListings(totalListings)
                .totalViews(totalViews)
                .totalLeads(totalLeads)
                .conversionRate(Math.round(conversionRate * 10.0) / 10.0)
                .appointmentCount(appointmentCount)
                .build();

        return TenantInventoryDTO.TenantAnalyticsResponse.builder()
                .summary(summary)
                .timeline(timeline)
                .statusBreakdown(statusBreakdown)
                .bodyTypeBreakdown(bodyTypeBreakdown)
                .branchBreakdown(branchBreakdown)
                .build();
    }

    private boolean isAuthorizedToWrite(String role) {
        if (role == null) return false;
        return "OWNER".equals(role) || "MANAGER".equals(role) || "INVENTORY_MANAGER".equals(role)
                || "ADMIN".equals(role) || "SUPER_ADMIN".equals(role);
    }

    private void recordAudit(String actorId, String action, String entity, String entityId, Map<String, Object> meta) {
        try {
            AuditLogEntity logEntity = AuditLogEntity.builder()
                    .id("aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .actorId(actorId)
                    .action(action)
                    .entity(entity)
                    .entityId(entityId)
                    .metaJson(objectMapper.writeValueAsString(meta))
                    .build();
            auditLogRepository.save(logEntity);
        } catch (Exception e) {
            log.error("Failed to record audit log", e);
        }
    }
}
