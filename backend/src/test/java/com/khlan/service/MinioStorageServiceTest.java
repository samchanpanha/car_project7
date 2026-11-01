package com.khlan.service;

import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class MinioStorageServiceTest {

    @Mock
    private MinioClient minioClient;

    private MinioStorageService minioStorageService;

    @BeforeEach
    void setUp() {
        minioStorageService = new MinioStorageService(minioClient);
        ReflectionTestUtils.setField(minioStorageService, "publicBucket", "test-public");
        ReflectionTestUtils.setField(minioStorageService, "privateBucket", "test-private");
    }

    @Test
    void uploadPrivateDoc_nullMimeType_doesNotThrowNpe() throws Exception {
        byte[] content = "test content".getBytes();
        String result = assertDoesNotThrow(() -> minioStorageService.uploadPrivateDoc(content, null));

        assertNotNull(result);
        assertTrue(result.startsWith("receipts/"));
        assertTrue(result.endsWith(".bin"));

        ArgumentCaptor<PutObjectArgs> captor = ArgumentCaptor.forClass(PutObjectArgs.class);
        verify(minioClient).putObject(captor.capture());
        PutObjectArgs args = captor.getValue();
        assertNotNull(args.contentType());
    }

    @Test
    void uploadPublicMedia_nullMimeType_doesNotThrowNpe() throws Exception {
        byte[] content = "dummy file content".getBytes();
        String result = assertDoesNotThrow(() -> minioStorageService.uploadPublicMedia(content, null));

        assertNotNull(result);
        assertTrue(result.contains("test-public"));
        assertTrue(result.endsWith(".bin"));

        verify(minioClient).putObject(any(PutObjectArgs.class));
    }
}

