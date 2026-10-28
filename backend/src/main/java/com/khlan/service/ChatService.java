package com.khlan.service;

import com.khlan.dto.ChatDTO;
import com.khlan.dto.VehicleDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final VehicleService vehicleService;

    public static final String SAFETY_TIP_MESSAGE =
            "Safety Tip: Never transfer money before inspecting the vehicle and verifying documents in person. / ការដាស់តឿនសុវត្ថិភាព៖ កុំផ្ទេរប្រាក់មុនពេលពិនិត្យរថយន្ត និងឯកសារផ្ទាល់។";

    @Transactional(readOnly = true)
    public Map<String, Object> listConversations(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required to access messages");
        }

        List<ConversationEntity> buyerRows = conversationRepository.findByBuyerIdOrderByUpdatedAtDesc(userId);
        List<ConversationEntity> sellerRows = conversationRepository.findBySellerIdOrderByUpdatedAtDesc(userId);
        Map<String, ConversationEntity> dedup = new LinkedHashMap<>();
        for (ConversationEntity c : buyerRows) dedup.put(c.getId(), c);
        for (ConversationEntity c : sellerRows) dedup.putIfAbsent(c.getId(), c);
        List<ConversationEntity> rows = new ArrayList<>(dedup.values());
        rows.sort((a, b) -> {
            if (a.getUpdatedAt() == null && b.getUpdatedAt() == null) return 0;
            if (a.getUpdatedAt() == null) return 1;
            if (b.getUpdatedAt() == null) return -1;
            return b.getUpdatedAt().compareTo(a.getUpdatedAt());
        });

        List<ChatDTO.ConversationListItemDTO> list = new ArrayList<>();

        for (ConversationEntity c : rows) {
            Optional<VehicleEntity> vehOpt = vehicleRepository.findById(c.getVehicleId());
            if (vehOpt.isEmpty()) continue;
            VehicleEntity v = vehOpt.get();

            boolean isSeller = v.getSellerId().equals(userId);
            String sellerName = "Seller";
            if (isSeller) {
                Optional<UserEntity> bOpt = userRepository.findById(c.getBuyerId());
                sellerName = bOpt.map(UserEntity::getName).orElse("Buyer");
            } else {
                Optional<UserEntity> sOpt = userRepository.findById(v.getSellerId());
                if (sOpt.isPresent()) {
                    Optional<SellerProfileEntity> spOpt = sellerProfileRepository.findByUserId(sOpt.get().getId());
                    sellerName = spOpt.map(SellerProfileEntity::getShopName).filter(s -> !s.isBlank()).orElse(sOpt.get().getName());
                }
            }

            Optional<MessageEntity> lastMsgOpt = messageRepository.findFirstByConversationIdOrderByCreatedAtDesc(c.getId());
            String thumb = (v.getImages() != null && !v.getImages().isEmpty())
                    ? v.getImages().get(0).getUrl()
                    : null;

            ChatDTO.MessageItemDTO lastMessage = lastMsgOpt.map(m -> ChatDTO.MessageItemDTO.builder()
                    .id(m.getId())
                    .body(m.getBody())
                    .isMine(userId.equals(m.getSenderId()))
                    .isSystem(Boolean.TRUE.equals(m.getIsSystem()))
                    .createdAt(m.getCreatedAt() != null ? m.getCreatedAt().toString() : null)
                    .build()).orElse(null);

            String role = isSeller ? "SELLER" : "BUYER";
            String contactName = sellerName;

            list.add(ChatDTO.ConversationListItemDTO.builder()
                    .id(c.getId())
                    .vehicle(ChatDTO.ConversationVehicleDTO.builder()
                            .id(v.getId())
                            .make(v.getMake())
                            .model(v.getModel())
                            .year(v.getYear())
                            .priceUsd(v.getPriceUsd())
                            .thumbnail(thumb)
                            .build())
                    .sellerName(sellerName)
                    .contactName(contactName)
                    .role(role)
                    .myRole(role)
                    .lastMessage(lastMessage)
                    .updatedAt(c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null)
                    .build());
        }

        return Map.of("conversations", list);
    }

    @Transactional
    public String startConversation(String userId, ChatDTO.StartConversationRequest req) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required to contact sellers");
        }
        if (req.getVehicleId() == null || req.getVehicleId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vehicleId is required");
        }
        if (req.getMessage() == null || req.getMessage().trim().length() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message must be at least 2 characters");
        }

        VehicleEntity vehicle = vehicleRepository.findById(req.getVehicleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        // Find or create conversation
        List<ConversationEntity> existing = conversationRepository.findByBuyerIdOrderByUpdatedAtDesc(userId);
        ConversationEntity conversation = existing.stream()
                .filter(c -> c.getVehicleId().equals(vehicle.getId()))
                .findFirst()
                .orElse(null);

        if (conversation == null) {
            String convId = "conv_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            conversation = ConversationEntity.builder()
                    .id(convId)
                    .vehicleId(vehicle.getId())
                    .buyerId(userId)
                    .createdAt(OffsetDateTime.now())
                    .updatedAt(OffsetDateTime.now())
                    .build();
            conversationRepository.save(conversation);

            // Safety tip message
            String tipId = "msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            MessageEntity tip = MessageEntity.builder()
                    .id(tipId)
                    .conversationId(conversation.getId())
                    .senderId(null)
                    .body(SAFETY_TIP_MESSAGE)
                    .isSystem(true)
                    .createdAt(OffsetDateTime.now())
                    .build();
            messageRepository.save(tip);
        }

        // Buyer message
        String msgId = "msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        MessageEntity buyerMsg = MessageEntity.builder()
                .id(msgId)
                .conversationId(conversation.getId())
                .senderId(userId)
                .body(req.getMessage().trim())
                .isSystem(false)
                .createdAt(OffsetDateTime.now())
                .build();
        messageRepository.save(buyerMsg);

        conversation.setUpdatedAt(OffsetDateTime.now());
        conversationRepository.save(conversation);

        return conversation.getId();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getConversation(String userId, String conversationId) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }

        ConversationEntity conv = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));

        VehicleEntity vehicle = vehicleRepository.findById(conv.getVehicleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        boolean allowed = conv.getBuyerId().equals(userId)
                || vehicle.getSellerId().equals(userId)
                || (vehicle.getCreatedById() != null && vehicle.getCreatedById().equals(userId));

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found");
        }

        List<MessageEntity> messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        List<ChatDTO.MessageItemDTO> msgDTOs = messages.stream().map(m -> ChatDTO.MessageItemDTO.builder()
                .id(m.getId())
                .body(m.getBody())
                .isMine(userId.equals(m.getSenderId()))
                .isSystem(Boolean.TRUE.equals(m.getIsSystem()))
                .createdAt(m.getCreatedAt() != null ? m.getCreatedAt().toString() : null)
                .build()).toList();

        String thumb = (vehicle.getImages() != null && !vehicle.getImages().isEmpty())
                ? vehicle.getImages().get(0).getUrl()
                : null;

        VehicleDTO.SellerSummaryDTO sellerSummary = vehicleService.getSellerSummary(vehicle.getSellerId());

        boolean isSeller = vehicle.getSellerId().equals(userId);
        String myRole = isSeller ? "SELLER" : "BUYER";
        Optional<UserEntity> buyerUser = userRepository.findById(conv.getBuyerId());
        ChatDTO.BuyerSummaryDTO buyerSummary = ChatDTO.BuyerSummaryDTO.builder()
                .id(conv.getBuyerId())
                .name(buyerUser.map(UserEntity::getName).orElse("Buyer"))
                .avatarUrl(buyerUser.map(UserEntity::getAvatarUrl).orElse(null))
                .build();

        String contactName = isSeller
                ? buyerSummary.getName()
                : (sellerSummary != null && sellerSummary.getShopName() != null && !sellerSummary.getShopName().isBlank()
                        ? sellerSummary.getShopName()
                        : (sellerSummary != null ? sellerSummary.getName() : "Seller"));

        ChatDTO.ConversationDetailDTO dto = ChatDTO.ConversationDetailDTO.builder()
                .id(conv.getId())
                .vehicle(ChatDTO.ConversationVehicleDTO.builder()
                        .id(vehicle.getId())
                        .make(vehicle.getMake())
                        .model(vehicle.getModel())
                        .year(vehicle.getYear())
                        .priceUsd(vehicle.getPriceUsd())
                        .thumbnail(thumb)
                        .build())
                .seller(sellerSummary)
                .buyer(buyerSummary)
                .myRole(myRole)
                .contactName(contactName)
                .messages(msgDTOs)
                .build();

        return Map.of("conversation", dto);
    }

    @Transactional
    public ChatDTO.MessageItemDTO sendMessage(String userId, String conversationId, ChatDTO.SendMessageRequest req) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        if (req == null || req.getBody() == null || req.getBody().trim().length() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "body (min 2 chars) is required");
        }

        ConversationEntity conv = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found"));

        VehicleEntity vehicle = vehicleRepository.findById(conv.getVehicleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        boolean allowed = conv.getBuyerId().equals(userId)
                || vehicle.getSellerId().equals(userId)
                || (vehicle.getCreatedById() != null && vehicle.getCreatedById().equals(userId));

        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found");
        }

        String msgId = "msg_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        MessageEntity msg = MessageEntity.builder()
                .id(msgId)
                .conversationId(conv.getId())
                .senderId(userId)
                .body(req.getBody().trim())
                .isSystem(false)
                .createdAt(OffsetDateTime.now())
                .build();
        messageRepository.save(msg);

        conv.setUpdatedAt(OffsetDateTime.now());
        conversationRepository.save(conv);

        return ChatDTO.MessageItemDTO.builder()
                .id(msg.getId())
                .body(msg.getBody())
                .isMine(true)
                .isSystem(false)
                .createdAt(msg.getCreatedAt().toString())
                .build();
    }
}
