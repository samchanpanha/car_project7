package com.khlan.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    @Value("${CLOUDFLARE_R2_ENDPOINT:${MINIO_ENDPOINT:http://localhost:9000}}")
    private String endpoint;

    @Value("${CLOUDFLARE_R2_ACCESS_KEY_ID:${MINIO_ACCESS_KEY:minioadmin}}")
    private String accessKey;

    @Value("${CLOUDFLARE_R2_SECRET_ACCESS_KEY:${MINIO_SECRET_KEY:minioadmin}}")
    private String secretKey;

    @Value("${minio.region:auto}")
    private String region;

    @Bean
    public MinioClient minioClient() {
        var builder = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey);
        if (region != null && !region.isBlank() && !region.equalsIgnoreCase("auto")) {
            builder.region(region);
        }
        return builder.build();
    }
}
