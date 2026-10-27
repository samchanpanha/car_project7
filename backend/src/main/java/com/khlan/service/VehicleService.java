package com.khlan.service;

import com.khlan.dto.VehicleDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleService {

    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final TenantBranchRepository tenantBranchRepository;
    private final VehicleHistoryReportRepository vehicleHistoryReportRepository;

    @Transactional(readOnly = true)
    public VehicleDTO.PagedVehiclesResponseDTO searchVehicles(
            String q,
            String make,
            String model,
            String city,
            String bodyType,
            String fuel,
            String transmission,
            String drivetrain,
            String condition,
            Double minPrice,
            Double maxPrice,
            Integer minYear,
            Integer maxYear,
            Integer minMileage,
            Integer maxMileage,
            Boolean featured,
            String sellerId,
            String dealerId,
            String sort,
            int page,
            int limit
    ) {
        // Enforce valid pagination
        int pageIndex = Math.max(0, page > 0 ? page - 1 : page);
        int pageSize = Math.max(1, Math.min(limit, 100));

        Sort sortOrder = switch (sort != null ? sort : "newest") {
            case "price_asc" -> Sort.by(Sort.Direction.ASC, "priceUsd");
            case "price_desc" -> Sort.by(Sort.Direction.DESC, "priceUsd");
            case "year_desc" -> Sort.by(Sort.Direction.DESC, "year");
            case "mileage_asc" -> Sort.by(Sort.Direction.ASC, "mileageKm");
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };

        Pageable pageable = PageRequest.of(pageIndex, pageSize, sortOrder);

        Specification<VehicleEntity> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Always PUBLISHED for public search
            predicates.add(cb.equal(root.get("status"), "PUBLISHED"));

            if (q != null && !q.isBlank()) {
                String searchPattern = "%" + q.trim().toLowerCase() + "%";
                Predicate qMake = cb.like(cb.lower(root.get("make")), searchPattern);
                Predicate qModel = cb.like(cb.lower(root.get("model")), searchPattern);
                Predicate qVariant = cb.like(cb.lower(root.get("variant")), searchPattern);
                Predicate qDesc = cb.like(cb.lower(root.get("description")), searchPattern);
                predicates.add(cb.or(qMake, qModel, qVariant, qDesc));
            }
            if (make != null && !make.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("make")), make.toLowerCase()));
            }
            if (model != null && !model.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("model")), model.toLowerCase()));
            }
            if (city != null && !city.isBlank()) {
                predicates.add(cb.equal(root.get("city"), city));
            }
            if (featured != null) {
                predicates.add(cb.equal(root.get("featured"), featured));
            }
            if (sellerId != null && !sellerId.isBlank()) {
                predicates.add(cb.equal(root.get("sellerId"), sellerId));
            }
            if (dealerId != null && !dealerId.isBlank()) {
                predicates.add(cb.equal(root.get("sellerId"), dealerId));
            }

            // Comma-separated enums
            addInPredicate(cb, root.get("bodyType"), bodyType, predicates);
            addInPredicate(cb, root.get("fuel"), fuel, predicates);
            addInPredicate(cb, root.get("transmission"), transmission, predicates);
            addInPredicate(cb, root.get("drivetrain"), drivetrain, predicates);
            addInPredicate(cb, root.get("condition"), condition, predicates);

            // Ranges
            if (minPrice != null) predicates.add(cb.greaterThanOrEqualTo(root.get("priceUsd"), minPrice));
            if (maxPrice != null) predicates.add(cb.lessThanOrEqualTo(root.get("priceUsd"), maxPrice));
            if (minYear != null) predicates.add(cb.greaterThanOrEqualTo(root.get("year"), minYear));
            if (maxYear != null) predicates.add(cb.lessThanOrEqualTo(root.get("year"), maxYear));
            if (minMileage != null) predicates.add(cb.greaterThanOrEqualTo(root.get("mileageKm"), minMileage));
            if (maxMileage != null) predicates.add(cb.lessThanOrEqualTo(root.get("mileageKm"), maxMileage));

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<VehicleEntity> pageResult = vehicleRepository.findAll(spec, pageable);

        List<VehicleDTO.VehicleCardDTO> cards = pageResult.getContent().stream()
                .map(this::toCardDTO)
                .collect(Collectors.toList());

        long total = pageResult.getTotalElements();
        int pageCount = Math.max(1, (int) Math.ceil((double) total / pageSize));

        return VehicleDTO.PagedVehiclesResponseDTO.builder()
                .items(cards)
                .vehicles(cards)
                .total(total)
                .page(pageIndex + 1)
                .pageSize(pageSize)
                .limit(pageSize)
                .pageCount(pageCount)
                .nextCursor(pageResult.hasNext() ? String.valueOf(pageIndex + 2) : null)
                .hasMore(pageResult.hasNext())
                .build();
    }

    @Transactional(readOnly = true)
    public List<VehicleDTO.VehicleCardDTO> getSimilarVehicles(String excludeId, String make, String bodyType) {
        Pageable limitFour = PageRequest.of(0, 4, Sort.by(Sort.Direction.DESC, "createdAt"));
        Specification<VehicleEntity> spec = (root, query, cb) -> {
            List<Predicate> preds = new ArrayList<>();
            preds.add(cb.equal(root.get("status"), "PUBLISHED"));
            if (excludeId != null && !excludeId.isBlank()) {
                preds.add(cb.notEqual(root.get("id"), excludeId));
            }
            if (make != null && !make.isBlank()) {
                preds.add(cb.equal(cb.lower(root.get("make")), make.toLowerCase()));
            } else if (bodyType != null && !bodyType.isBlank()) {
                preds.add(cb.equal(root.get("bodyType"), bodyType));
            }
            return cb.and(preds.toArray(new Predicate[0]));
        };
        return vehicleRepository.findAll(spec, limitFour).getContent().stream()
                .map(this::toCardDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public VehicleDTO.VehicleDetailDTO getVehicleById(String id, UserEntity viewer) {
        VehicleEntity vehicle = vehicleRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        // Visibility check: DRAFT and REJECTED only visible to owner or admin
        boolean isOwner = viewer != null && vehicle.getSellerId().equals(viewer.getId());
        boolean isStaff = viewer != null && ("ADMIN".equals(viewer.getRole()) || "SUPER_ADMIN".equals(viewer.getRole()));

        if (("DRAFT".equals(vehicle.getStatus()) || "REJECTED".equals(vehicle.getStatus())) && !isOwner && !isStaff) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found");
        }

        // Increment views
        vehicle.setViews(vehicle.getViews() + 1);
        vehicleRepository.save(vehicle);

        return toDetailDTO(vehicle);
    }

    @Transactional
    public String createVehicle(VehicleDTO.CreateVehicleRequest req, UserEntity seller) {
        String vehicleId = "veh_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        VehicleEntity vehicle = VehicleEntity.builder()
                .id(vehicleId)
                .sellerId(seller.getId())
                .createdById(seller.getId())
                .make(req.getMake())
                .model(req.getModel())
                .variant(req.getVariant())
                .year(req.getYear())
                .priceUsd(req.getPriceUsd())
                .mileageKm(req.getMileageKm())
                .transmission(req.getTransmission())
                .fuel(req.getFuel())
                .engineCc(req.getEngineCc())
                .drivetrain(req.getDrivetrain())
                .bodyType(req.getBodyType())
                .exteriorColor(req.getExteriorColor())
                .condition(req.getCondition() != null ? req.getCondition() : "USED")
                .city(req.getCity() != null ? req.getCity() : "Phnom Penh")
                .district(req.getDistrict())
                .description(req.getDescription())
                .descriptionKm(req.getDescriptionKm())
                .vinLast6(req.getVinLast6())
                .plateNo(req.getPlateNo())
                .ownershipCount(req.getOwnershipCount())
                .accidentDeclared(req.getAccidentDeclared() != null ? req.getAccidentDeclared() : "UNKNOWN")
                .importOrigin(req.getImportOrigin())
                .branchId(req.getBranchId())
                .status("PUBLISHED")
                .featured(false)
                .views(0)
                .build();

        // Attach images
        if (req.getImages() != null && !req.getImages().isEmpty()) {
            List<VehicleImageEntity> images = new ArrayList<>();
            for (int i = 0; i < req.getImages().size(); i++) {
                images.add(VehicleImageEntity.builder()
                        .id("img_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                        .vehicle(vehicle)
                        .url(req.getImages().get(i))
                        .sortOrder(i)
                        .build());
            }
            vehicle.setImages(images);
        }

        // Attach documents
        if (req.getDocuments() != null && !req.getDocuments().isEmpty()) {
            List<VehicleDocumentEntity> docs = new ArrayList<>();
            for (VehicleDTO.DocumentDTO doc : req.getDocuments()) {
                docs.add(VehicleDocumentEntity.builder()
                        .id("doc_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                        .vehicle(vehicle)
                        .type(doc.getType())
                        .status(doc.getStatus() != null ? doc.getStatus() : "PROVIDED")
                        .notes(doc.getNotes())
                        .fileUrl(doc.getFileUrl())
                        .build());
            }
            vehicle.setDocuments(docs);
        }

        vehicleRepository.save(vehicle);
        return vehicleId;
    }

    @Transactional
    public void updateVehicle(String id, VehicleDTO.UpdateVehicleRequest req, UserEntity actor) {
        VehicleEntity vehicle = vehicleRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        boolean isOwner = actor != null && vehicle.getSellerId().equals(actor.getId());
        boolean isStaff = actor != null && ("ADMIN".equals(actor.getRole()) || "SUPER_ADMIN".equals(actor.getRole()));

        if (!isOwner && !isStaff) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized to edit this vehicle");
        }

        if (req.getMake() != null) vehicle.setMake(req.getMake());
        if (req.getModel() != null) vehicle.setModel(req.getModel());
        if (req.getVariant() != null) vehicle.setVariant(req.getVariant());
        if (req.getYear() != null) vehicle.setYear(req.getYear());
        if (req.getPriceUsd() != null) vehicle.setPriceUsd(req.getPriceUsd());
        if (req.getMileageKm() != null) vehicle.setMileageKm(req.getMileageKm());
        if (req.getTransmission() != null) vehicle.setTransmission(req.getTransmission());
        if (req.getFuel() != null) vehicle.setFuel(req.getFuel());
        if (req.getEngineCc() != null) vehicle.setEngineCc(req.getEngineCc());
        if (req.getDrivetrain() != null) vehicle.setDrivetrain(req.getDrivetrain());
        if (req.getBodyType() != null) vehicle.setBodyType(req.getBodyType());
        if (req.getExteriorColor() != null) vehicle.setExteriorColor(req.getExteriorColor());
        if (req.getCity() != null) vehicle.setCity(req.getCity());
        if (req.getDistrict() != null) vehicle.setDistrict(req.getDistrict());
        if (req.getDescription() != null) vehicle.setDescription(req.getDescription());
        if (req.getDescriptionKm() != null) vehicle.setDescriptionKm(req.getDescriptionKm());
        if (req.getVinLast6() != null) vehicle.setVinLast6(req.getVinLast6());
        if (req.getPlateNo() != null) vehicle.setPlateNo(req.getPlateNo());
        if (req.getOwnershipCount() != null) vehicle.setOwnershipCount(req.getOwnershipCount());
        if (req.getAccidentDeclared() != null) vehicle.setAccidentDeclared(req.getAccidentDeclared());
        if (req.getImportOrigin() != null) vehicle.setImportOrigin(req.getImportOrigin());
        if (req.getStatus() != null) vehicle.setStatus(req.getStatus());
        if (req.getBranchId() != null) vehicle.setBranchId(req.getBranchId());

        if (req.getImages() != null) {
            vehicle.getImages().clear();
            for (int i = 0; i < req.getImages().size(); i++) {
                vehicle.getImages().add(VehicleImageEntity.builder()
                        .id("img_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                        .vehicle(vehicle)
                        .url(req.getImages().get(i))
                        .sortOrder(i)
                        .build());
            }
        }

        vehicleRepository.save(vehicle);
    }

    @Transactional
    public void deleteVehicle(String id, UserEntity actor) {
        VehicleEntity vehicle = vehicleRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        boolean isOwner = actor != null && vehicle.getSellerId().equals(actor.getId());
        boolean isStaff = actor != null && ("ADMIN".equals(actor.getRole()) || "SUPER_ADMIN".equals(actor.getRole()));

        if (!isOwner && !isStaff) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized to delete this vehicle");
        }

        vehicle.setStatus("ARCHIVED");
        vehicleRepository.save(vehicle);
    }

    @Transactional(readOnly = true)
    public List<VehicleDTO.VehicleCardDTO> getMyVehicles(UserEntity seller) {
        if (seller == null) return List.of();
        List<VehicleEntity> vehicles = vehicleRepository.findBySellerIdOrderByCreatedAtDesc(seller.getId());
        return vehicles.stream().map(this::toCardDTO).collect(Collectors.toList());
    }

    private void addInPredicate(jakarta.persistence.criteria.CriteriaBuilder cb,
                                jakarta.persistence.criteria.Path<String> path,
                                String commaSeparated,
                                List<Predicate> predicates) {
        if (commaSeparated != null && !commaSeparated.isBlank()) {
            List<String> tokens = Arrays.stream(commaSeparated.split(","))
                    .map(String::trim)
                    .map(String::toUpperCase)
                    .filter(s -> !s.isEmpty())
                    .toList();
            if (!tokens.isEmpty()) {
                predicates.add(path.in(tokens));
            }
        }
    }

    public VehicleDTO.VehicleCardDTO toCardDTO(VehicleEntity v) {
        List<String> images = v.getImages() != null
                ? v.getImages().stream().sorted(Comparator.comparingInt(VehicleImageEntity::getSortOrder)).map(VehicleImageEntity::getUrl).toList()
                : List.of();

        long docsProvided = v.getDocuments() != null
                ? v.getDocuments().stream().filter(d -> "PROVIDED".equals(d.getStatus()) || "VERIFIED".equals(d.getStatus())).count()
                : 0;

        boolean reportAvailable = vehicleHistoryReportRepository.existsByVehicleIdAndStatus(v.getId(), "COMPLETE");

        String branchName = null;
        if (v.getBranchId() != null) {
            branchName = tenantBranchRepository.findById(v.getBranchId()).map(TenantBranchEntity::getName).orElse(null);
        }

        return VehicleDTO.VehicleCardDTO.builder()
                .id(v.getId())
                .make(v.getMake())
                .model(v.getModel())
                .variant(v.getVariant())
                .year(v.getYear())
                .priceUsd(v.getPriceUsd())
                .mileageKm(v.getMileageKm())
                .transmission(v.getTransmission())
                .fuel(v.getFuel())
                .bodyType(v.getBodyType())
                .city(v.getCity())
                .district(v.getDistrict())
                .condition(v.getCondition())
                .status(v.getStatus())
                .featured(Boolean.TRUE.equals(v.getFeatured()))
                .views(v.getViews())
                .createdAt(v.getCreatedAt() != null ? v.getCreatedAt().toString() : OffsetDateTime.now().toString())
                .seller(getSellerSummary(v.getSellerId()))
                .images(images)
                .trust(VehicleDTO.TrustDTO.builder()
                        .docsProvided((int) docsProvided)
                        .reportAvailable(reportAvailable)
                        .build())
                .branchId(v.getBranchId())
                .branchName(branchName)
                .build();
    }

    private VehicleDTO.VehicleDetailDTO toDetailDTO(VehicleEntity v) {
        VehicleDTO.VehicleCardDTO card = toCardDTO(v);

        TenantBranchEntity branch = v.getBranchId() != null ? tenantBranchRepository.findById(v.getBranchId()).orElse(null) : null;

        List<VehicleDTO.DocumentDTO> docs = v.getDocuments() != null
                ? v.getDocuments().stream().map(d -> VehicleDTO.DocumentDTO.builder()
                .id(d.getId())
                .type(d.getType())
                .status(d.getStatus())
                .notes(d.getNotes())
                .fileUrl(d.getFileUrl())
                .build()).toList()
                : List.of();

        return VehicleDTO.VehicleDetailDTO.builder()
                .id(card.getId())
                .make(card.getMake())
                .model(card.getModel())
                .variant(card.getVariant())
                .year(card.getYear())
                .priceUsd(card.getPriceUsd())
                .mileageKm(card.getMileageKm())
                .transmission(card.getTransmission())
                .fuel(card.getFuel())
                .bodyType(card.getBodyType())
                .city(card.getCity())
                .district(card.getDistrict())
                .condition(card.getCondition())
                .status(card.getStatus())
                .featured(card.isFeatured())
                .views(card.getViews())
                .createdAt(card.getCreatedAt())
                .seller(card.getSeller())
                .images(card.getImages())
                .trust(card.getTrust())
                .branchId(card.getBranchId())
                .branchName(card.getBranchName())
                .engineCc(v.getEngineCc())
                .drivetrain(v.getDrivetrain())
                .exteriorColor(v.getExteriorColor())
                .vinLast6(v.getVinLast6())
                .plateNo(v.getPlateNo())
                .ownershipCount(v.getOwnershipCount())
                .accidentDeclared(v.getAccidentDeclared())
                .importOrigin(v.getImportOrigin())
                .description(v.getDescription())
                .descriptionKm(v.getDescriptionKm())
                .branchAddress(branch != null ? branch.getAddress() : null)
                .branchPhone(branch != null ? branch.getPhone() : null)
                .updatedAt(v.getUpdatedAt() != null ? v.getUpdatedAt().toString() : card.getCreatedAt())
                .documents(docs)
                .sellerFull(getSellerFull(v.getSellerId()))
                .report(null)
                .build();
    }

    public VehicleDTO.SellerSummaryDTO getSellerSummary(String sellerId) {
        UserEntity user = userRepository.findById(sellerId).orElse(null);
        if (user == null) {
            return VehicleDTO.SellerSummaryDTO.builder()
                    .id(sellerId)
                    .name("KhLan Seller")
                    .shopName(null)
                    .type("PRIVATE")
                    .verified(false)
                    .verification("UNVERIFIED")
                    .ratingAvg(0)
                    .ratingCount(0)
                    .city("Phnom Penh")
                    .build();
        }

        SellerProfileEntity p = sellerProfileRepository.findByUserId(sellerId).orElse(null);
        return VehicleDTO.SellerSummaryDTO.builder()
                .id(user.getId())
                .name(user.getName())
                .shopName(p != null ? p.getShopName() : null)
                .type(p != null && "DEALER".equals(p.getType()) ? "DEALER" : "PRIVATE")
                .verified(p != null && Boolean.TRUE.equals(p.getVerified()))
                .verification(p != null ? p.getVerification() : "UNVERIFIED")
                .ratingAvg(p != null ? p.getRatingAvg() : 0.0)
                .ratingCount(p != null ? p.getRatingCount() : 0)
                .city(p != null && p.getCity() != null ? p.getCity() : "Phnom Penh")
                .build();
    }

    public VehicleDTO.SellerFullDTO getSellerFull(String sellerId) {
        VehicleDTO.SellerSummaryDTO summary = getSellerSummary(sellerId);
        SellerProfileEntity p = sellerProfileRepository.findByUserId(sellerId).orElse(null);

        return VehicleDTO.SellerFullDTO.builder()
                .id(summary.getId())
                .name(summary.getName())
                .shopName(summary.getShopName())
                .type(summary.getType())
                .verified(summary.isVerified())
                .verification(summary.getVerification())
                .ratingAvg(summary.getRatingAvg())
                .ratingCount(summary.getRatingCount())
                .city(summary.getCity())
                .bio(p != null ? p.getBio() : null)
                .bioKm(p != null ? p.getBioKm() : null)
                .memberSince(p != null && p.getMemberSince() != null ? p.getMemberSince().toString() : OffsetDateTime.now().toString())
                .phone(p != null ? p.getPhone() : null)
                .telegram(p != null ? p.getTelegram() : null)
                .responseRate(p != null ? p.getResponseRate() : 0)
                .logoUrl(p != null ? p.getLogoUrl() : null)
                .tgMiniAppUrl(p != null ? p.getTgMiniAppUrl() : null)
                .tgChannelUrl(p != null ? p.getTgChannelUrl() : null)
                .tgGroupUrl(p != null ? p.getTgGroupUrl() : null)
                .inviteCode(p != null ? p.getInviteCode() : null)
                .build();
    }
}
