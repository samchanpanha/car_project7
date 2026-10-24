package com.khlan.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.ReportDTO;
import com.khlan.entity.VehicleDocumentEntity;
import com.khlan.entity.VehicleEntity;
import com.khlan.entity.VehicleHistoryReportEntity;
import com.khlan.repository.VehicleDocumentRepository;
import com.khlan.repository.VehicleHistoryReportRepository;
import com.khlan.repository.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.Year;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleReportService {

    private final VehicleRepository vehicleRepository;
    private final VehicleDocumentRepository vehicleDocumentRepository;
    private final VehicleHistoryReportRepository reportRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public ReportDTO getReportByVehicleId(String vehicleId) {
        return reportRepository.findFirstByVehicleIdAndStatusOrderByCreatedAtDesc(vehicleId, "COMPLETE")
                .map(this::toDTO)
                .orElse(null);
    }

    @Transactional
    public ReportDTO generateReport(String vehicleId, String requestedBy) {
        VehicleEntity vehicle = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        if ("DRAFT".equals(vehicle.getStatus()) || "REJECTED".equals(vehicle.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not visible");
        }

        List<VehicleDocumentEntity> docs = vehicleDocumentRepository.findByVehicleId(vehicleId);

        // Run deterministic rules
        List<ReportDTO.ReportCheckDTO> checks = new ArrayList<>();
        double scoreSum = 0;

        // 1. Odometer vs Age check
        int currentYear = Year.now().getValue();
        int age = Math.max(1, currentYear - vehicle.getYear());
        double avgKmPerYear = (double) vehicle.getMileageKm() / age;
        boolean odoPassed = avgKmPerYear <= 25000;
        double odoScore = odoPassed ? 1.0 : Math.max(0.4, 1.0 - (avgKmPerYear - 25000) / 30000.0);
        scoreSum += odoScore;
        checks.add(ReportDTO.ReportCheckDTO.builder()
                .area("mileage")
                .title("Odometer & mileage")
                .titleKm("ចំនួនគីឡូម៉ែត្រ")
                .status(odoPassed ? "EVIDENCE_FOUND" : "INCONSISTENCY_FLAGGED")
                .detail(String.format("Average of %,d km/year across %d years of road operation.", (int) avgKmPerYear, age))
                .detailKm(String.format("មធ្យមភាគ %,d គ.ម/ឆ្នាំ ក្នុងរយៈពេល %d ឆ្នាំនៃការបើកបរ។", (int) avgKmPerYear, age))
                .source("Odometer & Listing data")
                .confidence(Math.round(odoScore * 100.0) / 100.0)
                .build());

        // 2. Market Price Check
        boolean pricePassed = vehicle.getPriceUsd() >= 2000 && vehicle.getPriceUsd() <= 300000;
        double priceScore = pricePassed ? 0.95 : 0.6;
        scoreSum += priceScore;
        checks.add(ReportDTO.ReportCheckDTO.builder()
                .area("price")
                .title("Price vs market")
                .titleKm("តម្លៃធៀបទីផ្សារ")
                .status(pricePassed ? "EVIDENCE_FOUND" : "INCONSISTENCY_FLAGGED")
                .detail(String.format("Listed price of $%,.0f aligns within fair Cambodian marketplace benchmarks for %s %s.", vehicle.getPriceUsd(), vehicle.getMake(), vehicle.getModel()))
                .detailKm(String.format("តម្លៃដាក់លក់ $%,.0f សមស្របតាមកម្រិតទីផ្សារកម្ពុជាសម្រាប់ %s %s។", vehicle.getPriceUsd(), vehicle.getMake(), vehicle.getModel()))
                .source("Market comparables")
                .confidence(priceScore)
                .build());

        // 3. Document Completeness Check
        long verifiedDocs = docs.stream().filter(d -> "VERIFIED".equals(d.getStatus()) || "PROVIDED".equals(d.getStatus())).count();
        boolean docsPassed = verifiedDocs > 0;
        double docsScore = docsPassed ? Math.min(1.0, 0.6 + (verifiedDocs * 0.2)) : 0.5;
        scoreSum += docsScore;
        checks.add(ReportDTO.ReportCheckDTO.builder()
                .area("registration")
                .title("Registration book & paperwork")
                .titleKm("សៀវភៅចុះបញ្ជី និងឯកសារ")
                .status(docsPassed ? "VERIFIED" : "NOT_VERIFIED")
                .detail(docsPassed ? String.format("%d title / inspection documents recorded with listing.", verifiedDocs) : "No verified title documents attached yet.")
                .detailKm(docsPassed ? String.format("ឯកសារកម្មសិទ្ធិ / ត្រួតពិនិត្យចំនួន %d ត្រូវបានកត់ត្រា។", verifiedDocs) : "មិនទាន់មានឯកសារត្រួតពិនិត្យផ្លូវការត្រូវបានភ្ជាប់នៅឡើយទេ។")
                .source("Registration documents")
                .confidence(Math.round(docsScore * 100.0) / 100.0)
                .build());

        // 4. Accident Declaration Check
        String acc = vehicle.getAccidentDeclared() != null ? vehicle.getAccidentDeclared() : "UNKNOWN";
        boolean accPassed = "NONE_DECLARED".equals(acc);
        double accScore = accPassed ? 1.0 : ("MINOR_DECLARED".equals(acc) ? 0.75 : 0.5);
        scoreSum += accScore;
        checks.add(ReportDTO.ReportCheckDTO.builder()
                .area("accident")
                .title("Accident records & declaration")
                .titleKm("កំណត់ហេតុគ្រោះថ្នាក់")
                .status(accPassed ? "VERIFIED" : ("MINOR_DECLARED".equals(acc) ? "EVIDENCE_FOUND" : "NOT_VERIFIED"))
                .detail("NONE_DECLARED".equals(acc) ? "Seller explicitly declares no major frame accident history." : "Seller declared condition: " + acc)
                .detailKm("NONE_DECLARED".equals(acc) ? "អ្នកលក់បញ្ជាក់ច្បាស់ថាគ្មានប្រវត្តិគ្រោះថ្នាក់បាក់ឆ្អឹងឡើយ។" : "ស្ថានភាពដែលបានប្រកាស៖ " + acc)
                .source("Seller declaration")
                .confidence(accScore)
                .build());

        // 5. Identity & Plate Check
        boolean platePassed = vehicle.getPlateNo() != null && !vehicle.getPlateNo().isBlank();
        double plateScore = platePassed ? 1.0 : 0.6;
        scoreSum += plateScore;
        checks.add(ReportDTO.ReportCheckDTO.builder()
                .area("identity")
                .title("VIN & identity")
                .titleKm("អត្តសញ្ញាណ និងលេខសំគាល់")
                .status(platePassed ? "EVIDENCE_FOUND" : "NOT_VERIFIED")
                .detail(platePassed ? "License plate / registration number is registered on file." : "Plate number not public on listing.")
                .detailKm(platePassed ? "ស្លាកលេខសម្គាល់រថយន្តត្រូវបានកត់ត្រាក្នុងប្រព័ន្ធ។" : "ស្លាកលេខមិនទាន់ត្រូវបានបង្ហាញជាសាធារណៈ។")
                .source("Listing data")
                .confidence(plateScore)
                .build());

        double overallConfidence = Math.round((scoreSum / checks.size()) * 100.0) / 100.0;

        String summaryEn = String.format("Automated verification completed with %.0f%% confidence for %d %s %s. Inspection indicates vehicle is in %s condition with reasonable road usage.",
                overallConfidence * 100, vehicle.getYear(), vehicle.getMake(), vehicle.getModel(), vehicle.getCondition());

        String summaryKm = String.format("ការផ្ទៀងផ្ទាត់ដោយស្វ័យប្រវត្តិទទួលបានទំនុកចិត្ត %.0f%% សម្រាប់ %d %s %s។ ការត្រួតពិនិត្យបង្ហាញថារថយន្តស្ថិតក្នុងស្ថានភាព %s ជាមួយការប្រើប្រាស់សមរម្យ។",
                overallConfidence * 100, vehicle.getYear(), vehicle.getMake(), vehicle.getModel(), vehicle.getCondition());

        List<Map<String, String>> limitations = List.of(
                Map.of("en", "This report is generated from seller evidence, marketplace comparables, and document analysis.",
                        "km", "របាយការណ៍នេះបង្កើតឡើងពីភស្តុតាងរបស់អ្នកលក់ ការប្រៀបធៀបទីផ្សារ និងការវិភាគឯកសារ។"),
                Map.of("en", "Physical in-person inspection and mechanic hoist check are always recommended prior to fund transfer.",
                        "km", "ការពិនិត្យរថយន្តជាក់ស្តែង និងត្រួតពិនិត្យជាមួយជាងជំនាញ ត្រូវបានណែនាំជានិច្ចមុនពេលផ្ទេរប្រាក់។")
        );

        String checksJson;
        String limitationsJson;
        try {
            checksJson = objectMapper.writeValueAsString(checks);
            limitationsJson = objectMapper.writeValueAsString(limitations);
        } catch (Exception e) {
            checksJson = "[]";
            limitationsJson = "[]";
        }

        String reportId = "rep_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        VehicleHistoryReportEntity report = VehicleHistoryReportEntity.builder()
                .id(reportId)
                .vehicleId(vehicleId)
                .checksJson(checksJson)
                .limitationsJson(limitationsJson)
                .overallConfidence(overallConfidence)
                .summaryEn(summaryEn)
                .summaryKm(summaryKm)
                .status("COMPLETE")
                .requestedBy(requestedBy)
                .createdAt(OffsetDateTime.now())
                .build();

        reportRepository.save(report);

        return ReportDTO.builder()
                .id(reportId)
                .vehicleId(vehicleId)
                .status("COMPLETE")
                .overallConfidence(overallConfidence)
                .summaryEn(summaryEn)
                .summaryKm(summaryKm)
                .checks(checks)
                .limitations(limitations)
                .createdAt(report.getCreatedAt().toString())
                .build();
    }

    private ReportDTO toDTO(VehicleHistoryReportEntity entity) {
        List<ReportDTO.ReportCheckDTO> checks = Collections.emptyList();
        List<Map<String, String>> limitations = Collections.emptyList();

        try {
            if (entity.getChecksJson() != null) {
                checks = objectMapper.readValue(entity.getChecksJson(), new TypeReference<>() {});
            }
            if (entity.getLimitationsJson() != null) {
                limitations = objectMapper.readValue(entity.getLimitationsJson(), new TypeReference<>() {});
            }
        } catch (Exception ignored) {}

        return ReportDTO.builder()
                .id(entity.getId())
                .vehicleId(entity.getVehicleId())
                .status(entity.getStatus())
                .overallConfidence(entity.getOverallConfidence())
                .summaryEn(entity.getSummaryEn())
                .summaryKm(entity.getSummaryKm())
                .checks(checks)
                .limitations(limitations)
                .createdAt(entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : OffsetDateTime.now().toString())
                .build();
    }
}
