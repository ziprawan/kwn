import { NextRequest, NextResponse } from "next/server";
import { haversineMeters, isValidLatitudeLongitude } from "@/lib/geo";

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: [number, number][];
    };
  }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fromLat = Number(searchParams.get("fromLat"));
  const fromLng = Number(searchParams.get("fromLng"));
  const toLat = Number(searchParams.get("toLat"));
  const toLng = Number(searchParams.get("toLng"));

  if (
    !isValidLatitudeLongitude(fromLat, fromLng) ||
    !isValidLatitudeLongitude(toLat, toLng)
  ) {
    return NextResponse.json(
      { error: "Parameter koordinat rute tidak valid." },
      { status: 400 }
    );
  }

  const fallbackDistance = haversineMeters(fromLat, fromLng, toLat, toLng);
  const fallbackPayload = {
    mode: "straight-line" as const,
    distanceMeters: fallbackDistance,
    durationSeconds: null,
    coordinates: [
      [fromLat, fromLng],
      [toLat, toLng],
    ] as [number, number][],
  };

  try {
    const osrmUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const response = await fetch(osrmUrl, {
      headers: {
        "User-Agent": "PetaToiletITB-MVP/1.0",
      },
      signal: AbortSignal.timeout(3500),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(fallbackPayload);
    }

    const data = (await response.json()) as OsrmRouteResponse;
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;

    if (data.code !== "Ok" || !route || !Array.isArray(coords) || coords.length < 2) {
      return NextResponse.json(fallbackPayload);
    }

    // OSRM GeoJSON returns [lng, lat]; normalize to [lat, lng] for ToiletPoint / geo helpers
    const routeCoords: [number, number][] = coords.map(([lng, lat]) => [
      lat,
      lng,
    ]);

    return NextResponse.json({
      mode: "walking" as const,
      distanceMeters:
        typeof route.distance === "number" ? route.distance : fallbackDistance,
      durationSeconds:
        typeof route.duration === "number" ? route.duration : null,
      coordinates: routeCoords,
    });
  } catch {
    return NextResponse.json(fallbackPayload);
  }
}
