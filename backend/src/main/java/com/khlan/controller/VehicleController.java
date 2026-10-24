package com.khlan.controller;

import com.khlan.dto.ReportDTO;
import com.khlan.dto.VehicleDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.VehicleReportService;
import com.khlan.service.VehicleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "Vehicles", description = "Marketplace vehicle listings, search, creation, and AI history reports")
@RestController
@RequestMapping("/api/vehicles")
@RequiredArgsConstructor
public class VehicleController {

    private final VehicleService vehicleService;
    private final VehicleReportService vehicleReportService;

    @Operation(summary = "Search and filter published vehicles")
    @GetMapping
    public ResponseEntity<VehicleDTO.PagedVehiclesResponseDTO> searchVehicles(
            @RequestParam(required = false) String make,
            @RequestParam(required = false) String model,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String bodyType,
            @RequestParam(required = false) String fuel,
            @RequestParam(required = false) String transmission,
            @RequestParam(required = false) String drivetrain,
            @RequestParam(required = false) String condition,
            @RequestParam(required = false) Double minPrice,
            @RequestParam(required = false) Double maxPrice,
            @RequestParam(required = false) Integer minYear,
            @RequestParam(required = false) Integer maxYear,
            @RequestParam(required = false) Integer minMileage,
            @RequestParam(required = false) Integer maxMileage,
            @RequestParam(required = false) Boolean featured,
            @RequestParam(required = false) String sellerId,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int limit
    ) {
        return ResponseEntity.ok(vehicleService.searchVehicles(
                make, model, city, bodyType, fuel, transmission, drivetrain, condition,
                minPrice, maxPrice, minYear, maxYear, minMileage, maxMileage,
                featured, sellerId, sort, page, limit
        ));
    }

    @Operation(summary = "Get current authenticated user's vehicle listings")
    @GetMapping("/mine")
    public ResponseEntity<List<VehicleDTO.VehicleCardDTO>> getMyVehicles(
            @AuthenticationPrincipal UserEntity user
    ) {
        return ResponseEntity.ok(vehicleService.getMyVehicles(user));
    }

    @Operation(summary = "Get single vehicle details by ID with trust verification and seller profile")
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getVehicleById(
            @PathVariable String id,
            @AuthenticationPrincipal UserEntity viewer
    ) {
        VehicleDTO.VehicleDetailDTO detail = vehicleService.getVehicleById(id, viewer);
        ReportDTO report = vehicleReportService.getReportByVehicleId(id);
        detail.setReport(report);

        return ResponseEntity.ok(Map.of("vehicle", detail));
    }

    @Operation(summary = "Create a new vehicle listing with images and paperwork")
    @PostMapping
    public ResponseEntity<Map<String, Object>> createVehicle(
            @Valid @RequestBody VehicleDTO.CreateVehicleRequest req,
            @AuthenticationPrincipal UserEntity seller
    ) {
        if (seller == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized"));
        }
        String vehicleId = vehicleService.createVehicle(req, seller);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("vehicle", Map.of("id", vehicleId)));
    }

    @Operation(summary = "Update an existing vehicle listing")
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateVehicle(
            @PathVariable String id,
            @RequestBody VehicleDTO.UpdateVehicleRequest req,
            @AuthenticationPrincipal UserEntity actor
    ) {
        vehicleService.updateVehicle(id, req, actor);
        return ResponseEntity.ok(Map.of("ok", true, "id", id));
    }

    @Operation(summary = "Archive/delete a vehicle listing")
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteVehicle(
            @PathVariable String id,
            @AuthenticationPrincipal UserEntity actor
    ) {
        vehicleService.deleteVehicle(id, actor);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @Operation(summary = "Get AI Vehicle History Report")
    @GetMapping("/{id}/report")
    public ResponseEntity<Map<String, Object>> getVehicleReport(@PathVariable String id) {
        ReportDTO report = vehicleReportService.getReportByVehicleId(id);
        return ResponseEntity.ok(Map.of("report", report != null ? report : Map.of()));
    }

    @Operation(summary = "Run AI evaluation and generate bilingual Vehicle History Report")
    @PostMapping("/{id}/report")
    public ResponseEntity<Map<String, Object>> generateVehicleReport(
            @PathVariable String id,
            @AuthenticationPrincipal UserEntity user
    ) {
        String requestedBy = user != null ? user.getId() : "usr_demo_buyer";
        ReportDTO report = vehicleReportService.generateReport(id, requestedBy);
        return ResponseEntity.ok(Map.of("report", report));
    }
}
