import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { z } from 'zod';
import { ensureRestaurantSubscription } from '@/lib/billing/service';

const restaurantSchema = z.object({
  name: z.string().min(2, "Restaurant name must be at least 2 characters long."),
  phone: z.string().min(5, "Valid phone number required."),
  email: z.string().email("Valid email required.").optional().or(z.literal("")),
  address: z.string().min(5, "Address is required."),
  city: z.string().min(2, "City is required."),
  state: z.string().min(2, "State is required."),
  country: z.string().min(2, "Country is required."),
  pincode: z.string().min(3, "Pincode is required."),
  currency: z.string().default("USD"),
  timezone: z.string().default("UTC"),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const result = restaurantSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = result.data;
    const baseSlug = slugify(data.name);
    let finalSlug = baseSlug;
    let counter = 1;

    // Ensure unique slug
    while (await prisma.restaurant.findUnique({ where: { slug: finalSlug } })) {
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
    }

    // Transactional creation of restaurant and user-restaurant link
    const newRestaurant = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: data.name,
          slug: finalSlug,
          phone: data.phone,
          email: data.email || null,
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          pincode: data.pincode,
          currency: data.currency,
          timezone: data.timezone,
        },
      });

      await tx.restaurantUser.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      return restaurant;
    });

    await ensureRestaurantSubscription(newRestaurant.id);

    return NextResponse.json(
      { message: "Restaurant created successfully.", restaurant: newRestaurant },
      { status: 201 }
    );
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Internal server error. Please try again later." },
      { status: 500 }
    );
  }
}
