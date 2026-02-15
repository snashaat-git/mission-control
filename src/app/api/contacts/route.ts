import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryAll, run } from '@/lib/db';

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  label: string | null;
  created_at: string;
}

// GET /api/contacts - List all contacts
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';

  let contacts: Contact[];
  if (q) {
    contacts = queryAll<Contact>(
      `SELECT * FROM contacts WHERE name LIKE ? OR phone_number LIKE ? ORDER BY name`,
      [`%${q}%`, `%${q}%`]
    );
  } else {
    contacts = queryAll<Contact>(`SELECT * FROM contacts ORDER BY name`);
  }

  return NextResponse.json(contacts);
}

// POST /api/contacts - Add a contact
export async function POST(request: NextRequest) {
  try {
    const { name, phone_number, label } = await request.json();

    if (!name || !phone_number) {
      return NextResponse.json(
        { error: 'name and phone_number are required' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    run(
      `INSERT INTO contacts (id, name, phone_number, label, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, phone_number, label || null, now]
    );

    return NextResponse.json({ id, name, phone_number, label, created_at: now }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create contact' },
      { status: 500 }
    );
  }
}

// DELETE /api/contacts - Delete a contact by id (passed as query param)
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  run(`DELETE FROM contacts WHERE id = ?`, [id]);
  return NextResponse.json({ deleted: true });
}
