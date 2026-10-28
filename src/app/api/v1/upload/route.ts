import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif"
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif"
};

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPG, PNG, WebP, GIF, and AVIF are supported." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 5MB size limit." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Security Guard: Magic-byte inspection to verify authentic binary file signatures
    // Prevents polyglot payloads, HTML/SVG masquerades, and disguised executable uploads.
    const isValidImageBinary = (buf: Buffer): boolean => {
      if (buf.length < 12) return false;
      // JPEG: FF D8 FF
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      ) return true;
      // GIF: 47 49 46 38 ("GIF8")
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
      // WEBP: RIFF....WEBP
      if (
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
      ) return true;
      // AVIF: check for ftyp box with avif/avis brand
      const headerStr = buf.subarray(4, 16).toString("ascii");
      if (headerStr.includes("avif") || headerStr.includes("avis")) return true;

      return false;
    };

    if (!isValidImageBinary(buffer)) {
      return NextResponse.json(
        { error: "Security validation failed: File binary header is not a recognized authentic image format." },
        { status: 400 }
      );
    }

    // Determine extension
    const extension = MIME_EXTENSION_MAP[file.type] || path.extname(file.name).toLowerCase() || ".jpg";
    const filename = `${Date.now()}-${crypto.randomBytes(10).toString("hex")}${extension}`;

    // Target upload directory in public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      size: file.size,
      mimeType: file.type
    });
  } catch (error) {
    console.error("UPLOAD_ERROR", error);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
