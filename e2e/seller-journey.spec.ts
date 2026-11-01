import { test, expect } from "@playwright/test";

/**
 * Playwright End-to-End (E2E) Test Suite:
 * New Member Registration, Selling Products (Car & Spare Parts), and UI Inventory Management.
 */
test.describe.configure({ mode: "serial" });

test.describe("KhLan Marketplace — New Member Registration & Seller Journey", () => {
  const timestamp = Date.now().toString().slice(-6);
  const testPhone = `012${timestamp}`;
  const testPassword = "Password!2026";
  const testName = `Sopheap ${timestamp}`;
  let sessionToken: string = "";
  let createdVehicleId: string = "";

  test("1. UI Navigation: Verify homepage and Auth Registration dialog", async ({ page }) => {
    await page.goto("/");
    await page.waitForResponse((resp) => resp.url().includes("/api/session"));
    await page.waitForTimeout(300);

    // Verify unauthenticated user sees Sign Up button
    const signupBtn = page.getByRole("button", { name: /Sign up|ចុះឈ្មោះ/i }).first();
    await expect(signupBtn).toBeVisible();
    await signupBtn.click();
    await page.waitForTimeout(500);

    // Verify Auth view / dialog renders registration fields
    const nameInput = page.locator("#signup-name");
    await expect(nameInput).toBeVisible();

    const phoneInput = page.locator("#signup-phone");
    await expect(phoneInput).toBeVisible();

    // Verify role selection dropdown exists
    const roleSelector = page.locator("#signup-role");
    await expect(roleSelector).toBeVisible();
    await roleSelector.click();
    await page.waitForTimeout(300);

    const buyerItem = page.locator("[role='option']").first();
    await expect(buyerItem).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("2. Registration Flow: Register new member with Cambodian phone number and captcha", async ({ request }) => {
    // 1. Fetch live captcha challenge from backend
    const captchaRes = await request.get("/api/auth/captcha");
    expect(captchaRes.ok()).toBeTruthy();
    const challenge = await captchaRes.json();
    expect(challenge.id).toBeDefined();
    expect(challenge.word).toBeDefined();

    // 2. Solve captcha sequence to mint single-use captchaToken
    const verifyRes = await request.post("/api/auth/captcha/verify", {
      data: {
        id: challenge.id,
        sequence: challenge.word,
      },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const { captchaToken } = await verifyRes.json();
    expect(captchaToken).toBeDefined();

    // 3. Submit registration for a new private seller
    const registerRes = await request.post("/api/auth/register", {
      data: {
        name: testName,
        phone: testPhone,
        password: testPassword,
        role: "SELLER",
        locale: "en",
        captchaToken,
      },
    });

    expect(registerRes.ok()).toBeTruthy();
    const regData = await registerRes.json();
    expect(regData.ok).toBe(true);
    expect(regData.user).toBeDefined();
    expect(regData.user.name).toBe(testName);
    sessionToken = regData.sessionToken;
    expect(sessionToken).toBeDefined();
  });

  test("3. Post Products: Create a Car listing and a Spare Part listing", async ({ request }) => {
    expect(sessionToken).toBeTruthy();

    // 1. Post a Car listing
    const carRes = await request.post("/api/vehicles", {
      headers: {
        "x-khlan-session": sessionToken,
      },
      data: {
        listingCategory: "CAR",
        make: "Toyota",
        model: "Prius",
        year: 2023,
        variant: "Solar Roof",
        bodyType: "HATCHBACK",
        transmission: "AUTOMATIC",
        fuel: "HYBRID",
        exteriorColor: "Pearl White",
        mileageKm: 18000,
        priceUsd: 28500,
        priceMasked: false,
        condition: "EXCELLENT",
        description: "Freshly imported 2023 Toyota Prius in showroom condition. Clean history.",
        images: ["https://images.unsplash.com/photo-1549399542-7e3f8b79c341"],
      },
    });

    expect(carRes.ok()).toBeTruthy();
    const carData = await carRes.json();
    expect(carData.vehicle).toBeDefined();
    expect(carData.vehicle.id).toBeDefined();
    createdVehicleId = carData.vehicle.id;

    // 2. Post a Spare Part listing
    const partRes = await request.post("/api/vehicles", {
      headers: {
        "x-khlan-session": sessionToken,
      },
      data: {
        listingCategory: "SPARE_PART",
        make: "Lexus",
        model: "RX350",
        year: 2020,
        bodyType: "PARTS",
        transmission: "N/A",
        fuel: "N/A",
        mileageKm: 0,
        partCategory: "BRAKES",
        partTarget: "Lexus RX350 / RX450h (2016-2022)",
        partCondition: "NEW",
        priceUsd: 125,
        priceMasked: false,
        description: "Genuine OEM Ceramic Front Brake Pads set for Lexus RX.",
        images: ["https://images.unsplash.com/photo-1486006920555-c77dce18193b"],
      },
    });

    expect(partRes.ok()).toBeTruthy();
    const partData = await partRes.json();
    expect(partData.vehicle).toBeDefined();
    expect(partData.vehicle.id).toBeDefined();
  });

  test("4. Inventory Management: Read, update price, and change status of listing", async ({ request }) => {
    expect(createdVehicleId).toBeTruthy();

    // 1. Fetch public listing detail
    const detailRes = await request.get(`/api/vehicles/${createdVehicleId}`);
    expect(detailRes.ok()).toBeTruthy();
    const detailData = await detailRes.json();
    expect(detailData.vehicle.priceUsd).toBe(28500);
    expect(detailData.vehicle.status).toBe("PUBLISHED");

    // 2. Update price from $28,500 down to $27,900
    const updateRes = await request.patch(`/api/vehicles/${createdVehicleId}`, {
      headers: {
        "x-khlan-session": sessionToken,
      },
      data: {
        priceUsd: 27900,
        description: "Updated price: Freshly imported 2023 Toyota Prius in showroom condition.",
      },
    });
    expect(updateRes.ok()).toBeTruthy();

    // 3. Verify price updated in database
    const updatedDetailRes = await request.get(`/api/vehicles/${createdVehicleId}`);
    const updatedData = await updatedDetailRes.json();
    expect(updatedData.vehicle.priceUsd).toBe(27900);

    // 4. Archive listing
    const deleteRes = await request.delete(`/api/vehicles/${createdVehicleId}`, {
      headers: {
        "x-khlan-session": sessionToken,
      },
    });
    expect(deleteRes.ok()).toBeTruthy();

    // 5. Verify status transitioned to ARCHIVED
    const archivedRes = await request.get(`/api/vehicles/${createdVehicleId}`);
    const archivedData = await archivedRes.json();
    expect(archivedData.vehicle.status).toBe("ARCHIVED");
  });

  test("5. Authenticated UI Session: Open Sell View as logged in member and verify category tiles", async ({ page }) => {
    expect(sessionToken).toBeTruthy();

    await page.goto("/");
    // Inject session token into browser localStorage and cookie
    await page.evaluate((tok) => {
      localStorage.setItem("x-khlan-session", tok);
    }, sessionToken);
    await page.context().addCookies([
      {
        name: "khlan_auth",
        value: sessionToken,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.reload();
    await page.waitForResponse((resp) => resp.url().includes("/api/session"));
    await page.waitForTimeout(500);

    // Click Sell button
    const sellBtn = page.getByRole("button", { name: /Sell|លក់/i }).first();
    await expect(sellBtn).toBeVisible();
    await sellBtn.click();
    await page.waitForTimeout(600);

    // Verify categories in sell view
    const categoryCars = page.getByRole("button", { name: /Cars|រថយន្ត/i }).first();
    const categoryMotors = page.getByRole("button", { name: /Motorcycles|ម៉ូតូ/i }).first();
    const categoryParts = page.getByRole("button", { name: /Spare Parts|គ្រឿងបន្លាស់/i }).first();

    await expect(categoryCars).toBeVisible();
    await expect(categoryMotors).toBeVisible();
    await expect(categoryParts).toBeVisible();

    // Verify "Your listings" section displays the seller's active & archived items
    const yourListingsHeading = page.getByRole("heading", { name: /Your listings/i });
    await expect(yourListingsHeading).toBeVisible();
    await expect(page.getByText("Lexus RX350").first()).toBeVisible();
  });
});
