package com.khlan.controller;

import com.khlan.service.MinioStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@Tag(name = "Uploads", description = "Object storage uploads via MinIO")
@RestController
@RequestMapping("/api/uploads")
public class UploadController {

    private final MinioStorageService minioStorageService;

    public UploadController(MinioStorageService minioStorageService) {
        this.minioStorageService = minioStorageService;
    }

    @Operation(summary = "Upload public car photo or media")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> uploadMedia(@RequestParam("file") MultipartFile file) {
        try {
            String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
            String publicUrl = minioStorageService.uploadPublicMedia(file.getBytes(), mimeType);
            return ResponseEntity.ok(Map.of("url", publicUrl));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload file: " + e.getMessage()));
        }
    }

    @Operation(summary = "Upload private payment receipt or document")
    @PostMapping(value = "/private", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> uploadPrivateDoc(@RequestParam("file") MultipartFile file) {
        try {
            String mimeType = file.getContentType() != null ? file.getContentType() : "application/pdf";
            String objectKey = minioStorageService.uploadPrivateDoc(file.getBytes(), mimeType);
            return ResponseEntity.ok(Map.of("key", objectKey));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload document: " + e.getMessage()));
        }
    }

    @Operation(summary = "Get temporary presigned URL for private document")
    @GetMapping("/presigned")
    public ResponseEntity<Map<String, String>> getPresignedUrl(@RequestParam("key") String key) {
        try {
            String presignedUrl = minioStorageService.getPrivatePresignedUrl(key);
            return ResponseEntity.ok(Map.of("url", presignedUrl));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to generate presigned URL: " + e.getMessage()));
        }
    }
}
