import bcrypt from "bcrypt";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // ✅ FIX 4: increased limit for base64 photos

/* =========================
   SUPABASE CONFIG
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   GENERATE CARD ID
========================= */
function generateId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/* =========================
   CREATE VCARD
========================= */
app.post("/api/vcard", async (req, res) => {
  try {
    const id = generateId();

    let password_hash = null;
    if (req.body.password) {
      password_hash = await bcrypt.hash(req.body.password, 10);
    }

    const payload = {
      id,
      firstName:    req.body.firstName    || "",
      lastName:     req.body.lastName     || "",
      fullName:     req.body.fullName     || "",
      title:        req.body.title        || "",
      suffix:       req.body.suffix       || "",
      organization: req.body.organization || "",
      jobTitle:     req.body.jobTitle     || "",
      birthday:     req.body.birthday     || "",
      note:         req.body.note         || "",
      photo:        req.body.photo        || "",
      email_owner:  req.body.email_owner  || "", // ✅ FIX 5
      fields:       req.body.fields       || [],
      password_hash,
      created_at:   new Date()
    };

    const { error } = await supabase.from("vcards").insert([payload]);

    if (error) {
      console.log("INSERT ERROR:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ id });

  } catch (err) {
    console.log("CREATE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   LOGIN FOR EDIT  ✅ FIX 2 & 3
========================= */
app.post("/api/vcard/:id/login", async (req, res) => {
  try {
    const { password } = req.body;

    const { data, error } = await supabase
      .from("vcards")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: "Card not found" });
    }

    // ✅ FIX 2+3: handle no password set
    if (!data.password_hash) {
      return res.json({ success: true, message: "No password set" });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: "Please enter password" });
    }

    const valid = await bcrypt.compare(password, data.password_hash);

    if (valid) {
      return res.json({ success: true, message: "Authorized" });
    }

    return res.status(401).json({ success: false, message: "Wrong password" });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   UPDATE CARD
========================= */
app.put("/api/vcard/:id", async (req, res) => {
  try {
    const payload = { ...req.body };

    // Hash new password if provided
    if (payload.password) {
      payload.password_hash = await bcrypt.hash(payload.password, 10);
      delete payload.password; // don't store plain text
    } else {
      delete payload.password; // don't overwrite existing hash with empty
    }

    const { error } = await supabase
      .from("vcards")
      .update(payload)
      .eq("id", req.params.id);

    if (error) {
      console.log("UPDATE ERROR:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* =========================
   GET CARD JSON
========================= */
app.get("/api/vcard/:id/json", async (req, res) => {
  const { data, error } = await supabase
    .from("vcards")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Not found" });

  res.json(data);
});

/* =========================
   DOWNLOAD VCF  ✅ FIX 1: includes ALL fields
========================= */
app.get("/api/vcard/:id/vcf", async (req, res) => {
  const { data } = await supabase
    .from("vcards")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!data) return res.status(404).send("Not found");

  const esc = (v) => (v || "").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const lines = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");
  lines.push(`FN:${esc(data.fullName)}`);
  lines.push(`N:${esc(data.lastName)};${esc(data.firstName)};${esc(data.title || "")};${esc(data.suffix || "")};`);

  if (data.organization) lines.push(`ORG:${esc(data.organization)}`);
  if (data.jobTitle)     lines.push(`TITLE:${esc(data.jobTitle)}`);

  // Birthday: convert DD-MM-YYYY → YYYYMMDD
  if (data.birthday) {
    const parts = data.birthday.split("-");
    if (parts.length === 3) {
      lines.push(`BDAY:${parts[2]}${parts[1]}${parts[0]}`);
    } else {
      lines.push(`BDAY:${data.birthday}`);
    }
  }

  if (data.note) lines.push(`NOTE:${esc(data.note)}`);

  // Photo — URL (shows on iPhone preview) or base64 fallback
  if (data.photo) {
    if (data.photo.startsWith("http")) {
      // ✅ Hosted URL — iOS shows photo in preview before saving
      lines.push("PHOTO;VALUE=URL:" + data.photo);
    } else if (data.photo.startsWith("data:image")) {
      // Fallback: base64 chunked for compatibility
      const base64 = data.photo.split(",")[1];
      const type = (data.photo.match(/data:image\/([a-z]+)/) || [])[1];
      const imgType = type ? type.toUpperCase() : "JPEG";
      const header = "PHOTO;ENCODING=b;TYPE=" + imgType + ":";
      const chunkSize = 75;
      let photoLine = header;
      const firstLen = chunkSize - header.length;
      photoLine += base64.substring(0, firstLen);
      for (let i = firstLen; i < base64.length; i += chunkSize) {
        photoLine += "\r\n " + base64.substring(i, i + chunkSize);
      }
      lines.push(photoLine);
    }
  }

  // ✅ ALL dynamic fields: phone, email, website, address
  if (Array.isArray(data.fields)) {
    data.fields.forEach(field => {
      if (!field.value) return;
      const label = (field.label || "work").toUpperCase();

      if (field.type === "phone") {
        lines.push(`TEL;TYPE=${label},VOICE:${field.value}`);
      } else if (field.type === "email") {
        lines.push(`EMAIL;TYPE=${label}:${field.value}`);
      } else if (field.type === "website" || field.type === "url") {
        lines.push(`URL;TYPE=${label}:${field.value}`);
      } else if (field.type === "address") {
        lines.push(`ADR;TYPE=${label}:;;${esc(field.value)};;;;`);
      }
    });
  }

  lines.push("END:VCARD");

  const vcf = lines.join("\r\n") + "\r\n";

  res.setHeader("Content-Type", "text/vcard; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${(data.fullName || "vcard").replace(/[^a-z0-9]/gi, "_")}.vcf"`
  );
  res.send(vcf);
});

/* =========================
   QR CODE
========================= */
app.get("/api/vcard/:id/qr", async (req, res) => {
  const url = `https://oiwistudio.com/pages/vcard-preview?card=${req.params.id}`;
  // Return PNG image directly so it works in <img> tags
  const qrBuffer = await QRCode.toBuffer(url, { type: "png", width: 300, margin: 2 });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(qrBuffer);
});

/* =========================
   RESET PASSWORD REQUEST
========================= */
app.post("/api/vcard/:id/reset-request", async (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  await supabase.from("vcards").update({ edit_token: token }).eq("id", req.params.id);
  res.json({ reset_url: `https://oiwistudio.com/pages/vcard-reset?token=${token}` });
});

/* =========================
   RESET PASSWORD
========================= */
app.post("/api/vcard/reset/:token", async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);
  await supabase
    .from("vcards")
    .update({ password_hash: hash, edit_token: null })
    .eq("edit_token", req.params.token);
  res.json({ success: true });
});

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => res.send("vCard backend running ✅"));

/* =========================
   START SERVER
========================= */
app.listen(3000, () => console.log("Server running on port 3000"));
