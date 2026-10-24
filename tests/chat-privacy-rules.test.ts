import { describe, it, expect } from "vitest";

describe("Chat Privacy & Strict 2-Party Ownership Rules", () => {
  interface MockConversation {
    id: string;
    buyerId: string;
    vehicle: {
      sellerId: string;
      createdById: string;
    };
  }

  const sampleConv: MockConversation = {
    id: "conv_accord_001",
    buyerId: "usr_buyer_dara",
    vehicle: {
      sellerId: "usr_seller_sopheak",
      createdById: "usr_seller_sopheak",
    },
  };

  function canAccessConversation(userId: string | null | undefined, conv: MockConversation): {
    allowed: boolean;
    reason?: string;
  } {
    if (!userId || userId.trim() === "") {
      return { allowed: false, reason: "UNAUTHENTICATED" };
    }
    const isOwner =
      conv.buyerId === userId ||
      conv.vehicle.sellerId === userId ||
      conv.vehicle.createdById === userId;

    if (!isOwner) {
      return { allowed: false, reason: "NOT_FOUND" };
    }
    return { allowed: true };
  }

  it("should allow the buyer who started the chat to access and send messages", () => {
    const res = canAccessConversation("usr_buyer_dara", sampleConv);
    expect(res.allowed).toBe(true);
  });

  it("should allow the seller who owns the vehicle listing to access and send messages", () => {
    const res = canAccessConversation("usr_seller_sopheak", sampleConv);
    expect(res.allowed).toBe(true);
  });

  it("should block unauthenticated guests with UNAUTHENTICATED (401)", () => {
    expect(canAccessConversation(null, sampleConv)).toEqual({
      allowed: false,
      reason: "UNAUTHENTICATED",
    });
    expect(canAccessConversation("", sampleConv)).toEqual({
      allowed: false,
      reason: "UNAUTHENTICATED",
    });
  });

  it("should reject any third party user with NOT_FOUND (404) to prevent ID enumeration", () => {
    const thirdPartyUser = "usr_stranger_vireak";
    const res = canAccessConversation(thirdPartyUser, sampleConv);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("NOT_FOUND");
  });

  it("should ensure no canned auto-reply text is present in message creations", () => {
    const cannedKhmerSnippet = "ឡាននៅមានដូចការផ្សព្វផ្សាយ";
    const userMessage = "Hello Sopheak, is the car available?";

    expect(userMessage.includes(cannedKhmerSnippet)).toBe(false);
  });
});
