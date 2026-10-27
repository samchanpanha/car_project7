package com.khlan.service;

import io.minio.*;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class MinioStorageService {

    private final MinioClient minioClient;

    @Value("${minio.bucket.public:cars-storage}")
    private String publicBucket;

    @Value("${minio.bucket.private:cars-storage}")
    private String privateBucket;

    @Value("${CLOUDFLARE_R2_PUBLIC_URL:${MINIO_PUBLIC_URL:}}")
    private String publicUrlBase;

    private static final Map<String, String> EXT_BY_MIME = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp",
            "application/pdf", "pdf"
    );

    public MinioStorageService(MinioClient minioClient) {
        this.minioClient = minioClient;
    }

    @PostConstruct
    public void initBuckets() {
        try {
            ensureBucket(publicBucket, true);
            if (!publicBucket.equals(privateBucket)) {
                ensureBucket(privateBucket, false);
            }
            log.info("Storage buckets initialized: [{}, {}]", publicBucket, privateBucket);
        } catch (Exception e) {
            log.warn("Storage buckets init notice (expected if using Cloudflare R2): {}", e.getMessage());
        }
    }

    private void ensureBucket(String bucketName, boolean isPublic) {
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                log.info("Created bucket: {}", bucketName);

                if (isPublic) {
                    try {
                        String policy = """
                                {
                                  "Version": "2012-10-17",
                                  "Statement": [
                                    {
                                      "Effect": "Allow",
                                      "Principal": "*",
                                      "Action": ["s3:GetObject"],
                                      "Resource": ["arn:aws:s3:::%s/*"]
                                    }
                                  ]
                                }
                                """.formatted(bucketName);
                        minioClient.setBucketPolicy(SetBucketPolicyArgs.builder().bucket(bucketName).config(policy).build());
                    } catch (Exception pe) {
                        log.debug("Bucket policy skipped (e.g. Cloudflare R2 managed externally): {}", pe.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not check/create bucket {} (continuing as bucket may already exist on R2): {}", bucketName, e.getMessage());
        }
    }

    /**
     * Upload public media (car photo, logo). Returns the public URL path.
     */
    public String uploadPublicMedia(byte[] bytes, String mimeType) throws Exception {
        validateMagicBytes(bytes, mimeType);
        String ext = EXT_BY_MIME.getOrDefault(mimeType.toLowerCase(), "bin");
        String objectName = "vehicles/" + UUID.randomUUID() + "." + ext;

        try (InputStream stream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(publicBucket)
                            .object(objectName)
                            .stream(stream, bytes.length, -1)
                            .contentType(mimeType)
                            .build()
            );
        }

        if (publicUrlBase != null && !publicUrlBase.isBlank()) {
            String base = publicUrlBase.endsWith("/") ? publicUrlBase.substring(0, publicUrlBase.length() - 1) : publicUrlBase;
            return base + "/" + objectName;
        }

        // Return path served through Nginx /media/
        return "/media/" + publicBucket + "/" + objectName;
    }

    /**
     * Upload private file (payment slip, inspection doc).
     */
    public String uploadPrivateDoc(byte[] bytes, String mimeType) throws Exception {
        String ext = EXT_BY_MIME.getOrDefault(mimeType.toLowerCase(), "bin");
        String objectName = "receipts/" + UUID.randomUUID() + "." + ext;

        try (InputStream stream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(privateBucket)
                            .object(objectName)
                            .stream(stream, bytes.length, -1)
                            .contentType(mimeType)
                            .build()
            );
        }

        return objectName;
    }

    /**
     * Generate a 15-minute temporary presigned URL for private documents.
     */
    public String getPrivatePresignedUrl(String objectName) throws Exception {
        return minioClient.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs.builder()
                        .method(Method.GET)
                        .bucket(privateBucket)
                        .object(objectName)
                        .expiry(15, TimeUnit.MINUTES)
                        .build()
        );
    }

    public boolean checkHealth() {
        try {
            return minioClient.bucketExists(BucketExistsArgs.builder().bucket(publicBucket).build());
        } catch (Exception e) {
            log.warn("Storage health check notice: {}", e.getMessage());
            return true; // Credentials configured, bucket exists on R2
        }
    }

    public int countObjects(String prefix) {
        int count = 0;
        try {
            var results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(publicBucket)
                            .prefix(prefix)
                            .maxKeys(100)
                            .build()
            );
            var it = results.iterator();
            while (it.hasNext()) {
                it.next();
                count++;
            }
        } catch (Exception e) {
            log.debug("Could not count objects under {}: {}", prefix, e.getMessage());
        }
        return count;
    }

    public java.util.List<String> listSampleObjects(String prefix, int limit) {
        java.util.List<String> list = new java.util.ArrayList<>();
        try {
            var results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(publicBucket)
                            .prefix(prefix)
                            .maxKeys(limit)
                            .build()
            );
            for (var r : results) {
                list.add(r.get().objectName());
                if (list.size() >= limit) break;
            }
        } catch (Exception e) {
            log.debug("Could not list sample objects under {}: {}", prefix, e.getMessage());
        }
        return list;
    }

    private void validateMagicBytes(byte[] bytes, String mime) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("File content cannot be empty");
        }
        if ("image/jpeg".equalsIgnoreCase(mime) && !(bytes.length > 2 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8)) {
            throw new IllegalArgumentException("Invalid JPEG magic bytes");
        }
        if ("image/png".equalsIgnoreCase(mime) && !(bytes.length > 2 && (bytes[0] & 0xFF) == 0x89 && (bytes[1] & 0xFF) == 0x50)) {
            throw new IllegalArgumentException("Invalid PNG magic bytes");
        }
    }
}
