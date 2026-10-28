package com.khlan.service;

import com.khlan.dto.VehicleDTO;
import com.khlan.entity.UserEntity;
import com.khlan.entity.VehicleEntity;
import com.khlan.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class VehicleServiceCreateListingTest {

    @Mock
    private VehicleRepository vehicleRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private SellerProfileRepository sellerProfileRepository;
    @Mock
    private TenantBranchRepository tenantBranchRepository;
    @Mock
    private VehicleHistoryReportRepository vehicleHistoryReportRepository;

    @InjectMocks
    private VehicleService vehicleService;

    @Test
    void createsMaskedCarWithZeroReferencePrice() {
        VehicleDTO.CreateVehicleRequest request = request("CAR", 2020, 0.0, true);

        vehicleService.createVehicle(request, seller());

        VehicleEntity saved = capturedVehicle();
        assertEquals("CAR", saved.getListingCategory());
        assertEquals(0.0, saved.getPriceUsd());
        assertEquals(true, saved.getPriceMasked());
    }

    @Test
    void createsMotorcycleAndPersistsCategoryAndBodyType() {
        VehicleDTO.CreateVehicleRequest request = request("MOTOR", 1985, 1200.0, false);

        vehicleService.createVehicle(request, seller());

        VehicleEntity saved = capturedVehicle();
        assertEquals("MOTOR", saved.getListingCategory());
        assertEquals("SCOOTER", saved.getBodyType());
        assertEquals(1985, saved.getYear());
    }

    @Test
    void createsSparePartAndPersistsPartDetails() {
        VehicleDTO.CreateVehicleRequest request = request("SPARE_PART", 2026, 25.0, false);

        vehicleService.createVehicle(request, seller());

        VehicleEntity saved = capturedVehicle();
        assertEquals("SPARE_PART", saved.getListingCategory());
        assertEquals("TIRES_WHEELS", saved.getPartCategory());
        assertEquals("MOTOR", saved.getPartTarget());
        assertEquals("BRAND_NEW", saved.getPartCondition());
        assertEquals("Honda Dream 125", saved.getCompatibleModels());
        assertEquals("OEM-123", saved.getPartNumber());
    }

    @Test
    void rejectsZeroPriceWhenPriceIsNotMasked() {
        VehicleDTO.CreateVehicleRequest request = request("CAR", 2020, 0.0, false);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> vehicleService.createVehicle(request, seller()));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }

    private VehicleDTO.CreateVehicleRequest request(String category, int year, double price, boolean masked) {
        return VehicleDTO.CreateVehicleRequest.builder()
                .listingCategory(category)
                .make("Honda")
                .model(category.equals("SPARE_PART") ? "Brake pad" : "Civic")
                .year(year)
                .priceUsd(price)
                .priceMasked(masked)
                .partCategory(category.equals("SPARE_PART") ? "TIRES_WHEELS" : null)
                .partTarget(category.equals("SPARE_PART") ? "MOTOR" : null)
                .partCondition(category.equals("SPARE_PART") ? "BRAND_NEW" : null)
                .compatibleModels(category.equals("SPARE_PART") ? "Honda Dream 125" : null)
                .partNumber(category.equals("SPARE_PART") ? "OEM-123" : null)
                .mileageKm(0)
                .transmission("AUTOMATIC")
                .fuel("PETROL")
                .bodyType(category.equals("MOTOR") ? "SCOOTER" : category.equals("SPARE_PART") ? "PART" : "SEDAN")
                .build();
    }

    private UserEntity seller() {
        return UserEntity.builder().id("seller_1").build();
    }

    private VehicleEntity capturedVehicle() {
        ArgumentCaptor<VehicleEntity> captor = ArgumentCaptor.forClass(VehicleEntity.class);
        verify(vehicleRepository).save(captor.capture());
        return captor.getValue();
    }
}
