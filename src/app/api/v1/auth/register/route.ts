import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters long."),
  email: z.string().email("Invalid email address."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Security: Public registration can NEVER grant Super Admin privileges
    if (
      body &&
      typeof body === "object" &&
      ("isSuperAdmin" in body ||
        ("role" in body && String(body.role).toUpperCase().includes("SUPER")))
    ) {
      return NextResponse.json(
        { error: "Forbidden: Public registration cannot assign platform admin privileges." },
        { status: 403 }
      );
    }

    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user (explicitly non-Super-Admin)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        isSuperAdmin: false,
      },
    });

    // Create session
    await createSession({ userId: user.id, email: user.email });

    return NextResponse.json(
      {
        message: "Registration successful.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isSuperAdmin: false,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error. Please try again later." },
      { status: 500 }
    );
  }
}
