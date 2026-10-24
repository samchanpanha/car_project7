package com.khlan.service;

import com.khlan.dto.ChatDTO;
import com.khlan.dto.VehicleDTO;
import com.khlan.entity.ConversationEntity;
import com.khlan.entity.MessageEntity;
import com.khlan.entity.VehicleEntity;
import com.khlan.repository.ConversationRepository;
import com.khlan.repository.MessageRepository;
import com.khlan.repository.SellerProfileRepository;
import com.khlan.repository.UserRepository;
import com.khlan.repository.VehicleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private ConversationRepository conversationRepository;

    @Mock
    private MessageRepository messageRepository;

    @Mock
    private VehicleRepository vehicleRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SellerProfileRepository sellerProfileRepository;

    @Mock
    private VehicleService vehicleService;

    @InjectMocks
    private ChatService chatService;

    private ConversationEntity testConversation;
    private VehicleEntity testVehicle;

    @BeforeEach
    void setUp() {
        testVehicle = VehicleEntity.builder()
                .id("veh_accord_2021")
                .make("Honda")
                .model("Accord")
                .year(2021)
                .priceUsd(37500.0)
                .sellerId("usr_priv_sopheak")
                .build();

        testConversation = ConversationEntity.builder()
                .id("conv_001")
                .buyerId("usr_demo_buyer")
                .vehicleId(testVehicle.getId())
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();
    }

    @Test
    @DisplayName("Should reject unauthenticated guests with 401 UNAUTHORIZED on listConversations")
    void testListConversationsUnauthenticated() {
        ResponseStatusException ex1 = assertThrows(ResponseStatusException.class, () ->
                chatService.listConversations(null));
        assertEquals(HttpStatus.UNAUTHORIZED, ex1.getStatusCode());

        ResponseStatusException ex2 = assertThrows(ResponseStatusException.class, () ->
                chatService.listConversations(""));
        assertEquals(HttpStatus.UNAUTHORIZED, ex2.getStatusCode());
    }

    @Test
    @DisplayName("Should allow the buyer who started the chat to retrieve conversation detail")
    void testBuyerCanGetConversation() {
        when(conversationRepository.findById("conv_001")).thenReturn(Optional.of(testConversation));
        when(vehicleRepository.findById("veh_accord_2021")).thenReturn(Optional.of(testVehicle));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc("conv_001")).thenReturn(List.of());
        when(vehicleService.getSellerSummary("usr_priv_sopheak")).thenReturn(
                VehicleDTO.SellerSummaryDTO.builder()
                        .id("usr_priv_sopheak")
                        .name("Sopheak Ngin")
                        .build()
        );

        Map<String, Object> result = chatService.getConversation("usr_demo_buyer", "conv_001");
        assertNotNull(result);
        assertTrue(result.containsKey("conversation"));
        ChatDTO.ConversationDetailDTO dto = (ChatDTO.ConversationDetailDTO) result.get("conversation");
        assertEquals("conv_001", dto.getId());
        assertEquals("veh_accord_2021", dto.getVehicle().getId());
    }

    @Test
    @DisplayName("Should allow the listing seller to retrieve conversation detail")
    void testSellerCanGetConversation() {
        when(conversationRepository.findById("conv_001")).thenReturn(Optional.of(testConversation));
        when(vehicleRepository.findById("veh_accord_2021")).thenReturn(Optional.of(testVehicle));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc("conv_001")).thenReturn(List.of());
        when(vehicleService.getSellerSummary("usr_priv_sopheak")).thenReturn(
                VehicleDTO.SellerSummaryDTO.builder()
                        .id("usr_priv_sopheak")
                        .name("Sopheak Ngin")
                        .build()
        );

        Map<String, Object> result = chatService.getConversation("usr_priv_sopheak", "conv_001");
        assertNotNull(result);
        assertTrue(result.containsKey("conversation"));
    }

    @Test
    @DisplayName("Should reject unauthorized third-party user with 404 NOT_FOUND on getConversation")
    void testUnauthorizedUserBlockedFromGetConversation() {
        when(conversationRepository.findById("conv_001")).thenReturn(Optional.of(testConversation));
        when(vehicleRepository.findById("veh_accord_2021")).thenReturn(Optional.of(testVehicle));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                chatService.getConversation("usr_stranger_vireak", "conv_001"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(messageRepository, never()).findByConversationIdOrderByCreatedAtAsc(any());
    }

    @Test
    @DisplayName("Should reject unauthorized third-party user with 404 NOT_FOUND on sendMessage")
    void testUnauthorizedUserBlockedFromSendMessage() {
        when(conversationRepository.findById("conv_001")).thenReturn(Optional.of(testConversation));
        when(vehicleRepository.findById("veh_accord_2021")).thenReturn(Optional.of(testVehicle));

        ChatDTO.SendMessageRequest req = new ChatDTO.SendMessageRequest();
        req.setBody("Trying to post into someone else's chat");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                chatService.sendMessage("usr_stranger_vireak", "conv_001", req));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(messageRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should save message and NOT generate any canned auto-reply")
    void testSendMessageNoAutoReplyGenerated() {
        when(conversationRepository.findById("conv_001")).thenReturn(Optional.of(testConversation));
        when(vehicleRepository.findById("veh_accord_2021")).thenReturn(Optional.of(testVehicle));

        ChatDTO.SendMessageRequest req = new ChatDTO.SendMessageRequest();
        req.setBody("Is 10 AM good for inspection?");

        ChatDTO.MessageItemDTO result = chatService.sendMessage("usr_demo_buyer", "conv_001", req);

        assertNotNull(result);
        assertEquals("Is 10 AM good for inspection?", result.getBody());
        assertTrue(result.isMine());

        // Verify messageRepository.save was called EXACTLY ONCE (for the user's message, NO auto-reply)
        verify(messageRepository, times(1)).save(any(MessageEntity.class));
    }
}
