package com.khlan.controller;

import com.khlan.dto.UploadDTO;
import com.khlan.service.MinioStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Tag(name = "Uploads", description = "Object storage uploads via MinIO and local fast cache")
@RestController
@RequestMapping("/api/uploads")
public class UploadController {

    private final MinioStorageService minioStorageService;
    private static final String UPLOAD_DIR = "uploads";

    public UploadController(MinioStorageService minioStorageService) {
        this.minioStorageService = minioStorageService;
        File dir = new File(UPLOAD_DIR);
        if (!dir.exists()) {
            dir.mkdirs();
        }
    }

    @Operation(summary = "Upload media via Base64 data URL JSON payload")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> uploadMediaJson(@RequestBody UploadDTO.UploadDataUrlRequest req) {
        if (req == null || req.getDataUrl() == null || req.getDataUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dataUrl is required");
        }

        try {
            String dataUrl = req.getDataUrl().trim();
            String mimeType = "image/jpeg";
            String base64Data = dataUrl;

            int commaIndex = dataUrl.indexOf(",");
            if (commaIndex > 0) {
                String header = dataUrl.substring(0, commaIndex);
                base64Data = dataUrl.substring(commaIndex + 1);
                int colonIndex = header.indexOf(":");
                int semiIndex = header.indexOf(";");
                if (colonIndex >= 0 && semiIndex > colonIndex) {
                    mimeType = header.substring(colonIndex + 1, semiIndex);
                }
            }

            byte[] bytes = Base64.getDecoder().decode(base64Data);
            String ext = resolveExtension(mimeType);
            String filename = UUID.randomUUID().toString().replace("-", "") + "." + ext;

            // 1. Save to local disk cache for instantaneous delivery
            saveFileToDisk(filename, bytes);

            // 2. Best-effort mirror to MinIO in background/storage
            try {
                minioStorageService.uploadPublicMedia(bytes, mimeType);
            } catch (Exception me) {
                log.warn("MinIO sync notice during upload: {}", me.getMessage());
            }

            String publicUrl = "/api/uploads/" + filename;
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("url", publicUrl));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid Base64 payload: " + e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to store upload dataUrl", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload file: " + e.getMessage()));
        }
    }

    @Operation(summary = "Upload public car photo or media via Multipart form")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> uploadMediaMultipart(@RequestParam("file") MultipartFile file) {
        try {
            String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
            byte[] bytes = file.getBytes();
            String ext = resolveExtension(mimeType);
            String filename = UUID.randomUUID().toString().replace("-", "") + "." + ext;

            saveFileToDisk(filename, bytes);

            try {
                minioStorageService.uploadPublicMedia(bytes, mimeType);
            } catch (Exception me) {
                log.warn("MinIO sync notice during multipart upload: {}", me.getMessage());
            }

            String publicUrl = "/api/uploads/" + filename;
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("url", publicUrl));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to upload file: " + e.getMessage()));
        }
    }

    @Operation(summary = "Serve uploaded media file")
    @GetMapping("/{file}")
    public ResponseEntity<byte[]> serveFile(@PathVariable("file") String file) {
        if (!file.matches("^[a-zA-Z0-9_.-]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name");
        }

        Path filePath = resolveFilePath(file);
        if (filePath == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found");
        }

        try {
            byte[] bytes = Files.readAllBytes(filePath);
            String mimeType = Files.probeContentType(filePath);
            if (mimeType == null) {
                mimeType = "application/octet-stream";
            }

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(mimeType))
                    .header("Cache-Control", "public, max-age=31536000, immutable")
                    .body(bytes);
        } catch (IOException e) {
            log.error("Failed to read file {}", file, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read file");
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

    private String resolveExtension(String mimeType) {
        if (mimeType == null) return "jpg";
        return switch (mimeType.toLowerCase()) {
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            case "image/gif" -> "gif";
            case "application/pdf" -> "pdf";
            default -> "jpg";
        };
    }

    private Path resolveFilePath(String file) {
        Path p = Paths.get(UPLOAD_DIR, file);
        if (Files.exists(p)) return p;

        Path tmpP = Paths.get(System.getProperty("java.io.tmpdir"), "uploads", file);
        if (Files.exists(tmpP)) return tmpP;

        Path publicFilePath = Paths.get("public", "uploads", file);
        if (Files.exists(publicFilePath)) return publicFilePath;

        return null;
    }

    private void saveFileToDisk(String filename, byte[] bytes) throws IOException {
        Path p = Paths.get(UPLOAD_DIR, filename);
        try {
            if (p.getParent() != null && !Files.exists(p.getParent())) {
                Files.createDirectories(p.getParent());
            }
            Files.write(p, bytes);
        } catch (Exception e) {
            log.warn("Could not write to {}, falling back to tmpdir: {}", p, e.getMessage());
            Path tmpPath = Paths.get(System.getProperty("java.io.tmpdir"), "uploads", filename);
            if (tmpPath.getParent() != null && !Files.exists(tmpPath.getParent())) {
                Files.createDirectories(tmpPath.getParent());
            }
            Files.write(tmpPath, bytes);
        }
    }
}
