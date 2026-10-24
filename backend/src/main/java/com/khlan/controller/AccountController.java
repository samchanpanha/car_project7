package com.khlan.controller;

import com.khlan.dto.AccountDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.AccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    private String requireUserId(UserEntity user) {
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return user.getId();
    }

    @GetMapping("/profile")
    public ResponseEntity<Map<String, Object>> getProfile(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(accountService.getProfile(requireUserId(user)));
    }

    @PatchMapping("/profile")
    public ResponseEntity<Map<String, Object>> patchProfile(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AccountDTO.UpdateProfileRequest req
    ) {
        return ResponseEntity.ok(accountService.updateProfile(requireUserId(user), req));
    }

    @PutMapping("/profile")
    public ResponseEntity<Map<String, Object>> putProfile(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AccountDTO.UpdateProfileRequest req
    ) {
        return ResponseEntity.ok(accountService.updateProfile(requireUserId(user), req));
    }

    @PostMapping("/password")
    public ResponseEntity<Map<String, Object>> changePassword(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AccountDTO.ChangePasswordRequest req
    ) {
        accountService.changePassword(requireUserId(user), req);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/overview")
    public ResponseEntity<AccountDTO.AccountOverviewDTO> getOverview(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(accountService.getOverview(requireUserId(user)));
    }

    @GetMapping("/saved-searches")
    public ResponseEntity<List<AccountDTO.SavedSearchDTO>> getSavedSearches(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(accountService.getSavedSearches(requireUserId(user)));
    }

    @PostMapping("/saved-searches")
    public ResponseEntity<AccountDTO.SavedSearchDTO> createSavedSearch(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AccountDTO.CreateSavedSearchRequest req
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(accountService.createSavedSearch(requireUserId(user), req));
    }

    @DeleteMapping("/saved-searches/{id}")
    public ResponseEntity<Map<String, Object>> deleteSavedSearch(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        accountService.deleteSavedSearch(requireUserId(user), id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/saved-searches/{id}/run")
    public ResponseEntity<AccountDTO.RunSavedSearchResponse> runSavedSearch(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        return ResponseEntity.ok(accountService.runSavedSearch(requireUserId(user), id));
    }
}
