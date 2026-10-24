package com.khlan.controller;

import com.khlan.dto.ChatDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    private String requireUserId(UserEntity user) {
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return user.getId();
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> listConversations(@AuthenticationPrincipal UserEntity user) {
        String userId = user != null ? user.getId() : null;
        return ResponseEntity.ok(chatService.listConversations(userId));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> startConversation(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody ChatDTO.StartConversationRequest req
    ) {
        String convId = chatService.startConversation(requireUserId(user), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("conversationId", convId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getConversation(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        return ResponseEntity.ok(chatService.getConversation(requireUserId(user), id));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<Map<String, Object>> sendMessage(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody ChatDTO.SendMessageRequest req
    ) {
        ChatDTO.MessageItemDTO msg = chatService.sendMessage(requireUserId(user), id, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("message", msg));
    }
}
