package com.khlan.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("KhLan (ឡាន) Car Marketplace API")
                        .version("1.0.0")
                        .description(
                                "High-performance Spring Boot 3.4 REST API for Cambodia's AI-Powered Car Marketplace")
                        .contact(new Contact().name("KhLan Engineering").email("dev@khlan.com"))
                        .license(new License().name("Proprietary")));
    }
}
