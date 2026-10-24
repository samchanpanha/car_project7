package com.khlan.controller;

import com.khlan.dto.MetaDTO;
import com.khlan.service.MetaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/meta")
@RequiredArgsConstructor
@Tag(name = "Metadata", description = "Vehicle catalog filters, body types, fuel types, price bounds, and active seller statistics")
public class MetaController {

    private final MetaService metaService;

    @GetMapping
    @Operation(summary = "Get vehicle catalog metadata for search facets and filters")
    public ResponseEntity<MetaDTO> getMeta() {
        return ResponseEntity.ok(metaService.getMetadata());
    }
}
