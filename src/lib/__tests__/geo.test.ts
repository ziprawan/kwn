import { describe, expect, it } from "vitest";
import {
  ITB_CENTER,
  buildGoogleMapsWalkingUrl,
  findNearestCandidates,
  formatCoordinates,
  formatDistanceId,
  formatDurationId,
  haversineMeters,
  isValidLatitudeLongitude,
  isWithinItbPinBounds,
} from "@/lib/geo";

describe("geo utilities", () => {
  it("computes accurate Haversine distance between ITB landmarks", () => {
    // Perpustakaan Pusat ITB -> Sabuga ITB (~555 m apart)
    const perpus = { lat: -6.8913, lng: 107.6106 };
    const sabuga = { lat: -6.8863, lng: 107.6108 };
    const distance = haversineMeters(perpus.lat, perpus.lng, sabuga.lat, sabuga.lng);

    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(650);
  });

  it("validates coordinates inside ITB Kampus Ganesha bounds", () => {
    expect(isWithinItbPinBounds(ITB_CENTER.lat, ITB_CENTER.lng)).toBe(true);
    expect(isWithinItbPinBounds(-6.8863, 107.6108)).toBe(true); // Sabuga
    expect(isWithinItbPinBounds(-6.8913, 107.6106)).toBe(true); // Perpus

    // Reject coordinates outside ITB Ganesha / invalid numbers
    expect(isWithinItbPinBounds(0, 0)).toBe(false);
    expect(isWithinItbPinBounds(-6.2, 106.8)).toBe(false); // Jakarta
    expect(isWithinItbPinBounds(Number.NaN, 107.61)).toBe(false);
    expect(isValidLatitudeLongitude(95, 107.61)).toBe(false);
  });

  it("ranks nearest toilet candidates correctly", () => {
    const user = { lat: -6.8915, lng: 107.6105 };
    const toilets = [
      { id: "far", name: "Sabuga", latitude: -6.8863, longitude: 107.6108 },
      { id: "near", name: "Perpus", latitude: -6.8913, longitude: 107.6106 },
      { id: "mid", name: "CC Timur", latitude: -6.8927, longitude: 107.6115 },
    ];

    const ranked = findNearestCandidates(user.lat, user.lng, toilets, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].toilet.id).toBe("near");
    expect(ranked[1].toilet.id).toBe("mid");
    expect(ranked[0].straightDistanceMeters).toBeLessThan(
      ranked[1].straightDistanceMeters
    );
  });

  it("formats Indonesian distances, durations, coordinates, and Google Maps walking links", () => {
    expect(formatDistanceId(85.4)).toBe("85 m");
    expect(formatDistanceId(1250)).toBe("1,3 km");
    expect(formatDurationId(40)).toBe("< 1 mnt jalan");
    expect(formatDurationId(185)).toBe("3 mnt jalan");
    expect(formatCoordinates(-6.8909, 107.6104)).toBe("-6.89090, 107.61040");

    const url = buildGoogleMapsWalkingUrl(-6.8913, 107.6106, -6.892, 107.61);
    expect(url).toContain("https://www.google.com/maps/dir/");
    expect(url).toContain("travelmode=walking");
    expect(url).toContain("destination=-6.8913%2C107.6106");
    expect(url).toContain("origin=-6.892%2C107.61");
  });
});
