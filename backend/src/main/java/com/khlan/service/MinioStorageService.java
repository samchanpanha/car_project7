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

    @Value("${minio.bucket.public:khlan-public}")
    private String publicBucket;

    @Value("${minio.bucket.private:khlan-private}")
    private String privateBucket;

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
            ensureBucket(privateBucket, false);
            log.info("MinIO buckets initialized: [{}, {}]", publicBucket, privateBucket);
        } catch (Exception e) {
            log.error("Failed to initialize MinIO buckets", e);
        }
    }

    private void ensureBucket(String bucketName, boolean isPublic) throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
            log.info("Created MinIO bucket: {}", bucketName);

            if (isPublic) {
                // Anonymous read policy for public car photos
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
            }
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
