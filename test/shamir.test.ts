import { describe, it, expect } from "vitest";
import { splitSecret, combineShares, serializeShare, parseShare } from "@/lib/shamir";

describe("Shamir Secret Sharing", () => {
  const secret = Buffer.from("deadbeefcafe00112233445566778899", "hex");

  it("rekonstruiert das Geheimnis aus genau k Shares (3-of-5)", () => {
    const shares = splitSecret(secret, 5, 3);
    expect(shares).toHaveLength(5);
    const combined = combineShares([shares[0], shares[2], shares[4]]);
    expect(combined.equals(secret)).toBe(true);
  });

  it("rekonstruiert aus einer beliebigen k-Teilmenge", () => {
    const shares = splitSecret(secret, 5, 3);
    const combined = combineShares([shares[1], shares[3], shares[0]]);
    expect(combined.equals(secret)).toBe(true);
  });

  it("liefert mit weniger als k Shares NICHT das Geheimnis", () => {
    const shares = splitSecret(secret, 5, 3);
    const combined = combineShares([shares[1], shares[3]]);
    expect(combined.equals(secret)).toBe(false);
  });

  it("überlebt Serialisierung/Deserialisierung der Shares", () => {
    const shares = splitSecret(secret, 3, 2);
    const roundtripped = shares.map((s) => parseShare(serializeShare(s)));
    const combined = combineShares([roundtripped[0], roundtripped[2]]);
    expect(combined.equals(secret)).toBe(true);
  });
});
