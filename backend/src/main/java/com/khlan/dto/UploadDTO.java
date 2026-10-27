package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class UploadDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UploadDataUrlRequest {
        private String dataUrl;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UploadResponse {
        private String url;
        private String key;
    }
}
