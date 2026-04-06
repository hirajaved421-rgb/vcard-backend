import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
const SECRET = "my-secret-key"
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   SUPABASE CONFIG
========================= */

const SUPABASE_URL = "https://eivrsuzrvldljpecavqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnJzdXpydmxkbGpwZWNhdnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NDg5NTMsImV4cCI6MjA4OTAyNDk1M30.9zmECLy60FUsZWnGm37ckAzvj-q1RnuHG2-5G2Ks1UY";

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
      firstName: req.body.firstName || "",
      lastName: req.body.lastName || "",
      fullName: req.body.fullName || "",
      organization: req.body.organization || "",
      jobTitle: req.body.jobTitle || "",
      birthday: req.body.birthday || "",
      note: req.body.note || "",
      photo: req.body.photo || "",
      fields: req.body.fields || [],
      password_hash,
      created_at: new Date()
    };

    const { error } = await supabase
      .from("vcards")
      .insert([payload]);

    if (error) {
      console.log(error);
      return res.status(500).json(error);
    }

    res.json({ id });

  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});
/* =========================
   LOGIN FOR EDIT
========================= */

app.post("/api/vcard/:id/login", async (req, res) => {

  const { password } = req.body;

  const { data, error } = await supabase
    .from("vcards")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).send("Card not found");

  console.log("Entered password:", password);
console.log("Stored hash:", data.password_hash);

const valid = await bcrypt.compare(password, data.password_hash);

console.log("Match result:", valid);

  if (!valid) return res.status(401).send("Invalid password");

  res.json({ success: true });

});

/* =========================
   UPDATE CARD
========================= */

app.put("/api/vcard/:id", async (req, res) => {

  const { error } = await supabase
    .from("vcards")
    .update(req.body)
    .eq("id", req.params.id);

  if (error) {
    console.log(error);
    return res.status(500).json(error);
  }

  res.json({ success: true });

});

/* =========================
   RESET PASSWORD REQUEST
========================= */

app.post("/api/vcard/:id/reset-request", async (req, res) => {

  const token = crypto.randomBytes(32).toString("hex");

  await supabase
    .from("vcards")
    .update({ edit_token: token })
    .eq("id", req.params.id);

  res.json({
    reset_url: `https://oiwistudio.com/pages/vcard-reset?token=${token}`
  });

});

/* =========================
   RESET PASSWORD
========================= */

app.post("/api/vcard/reset/:token", async (req, res) => {

  const hash = await bcrypt.hash(req.body.password, 10);

  await supabase
    .from("vcards")
    .update({
      password_hash: hash,
      edit_token: null
    })
    .eq("edit_token", req.params.token);

  res.json({ success: true });

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

  if (error || !data) return res.status(404).send("Not found");

  res.json(data);

});

/* =========================
   DOWNLOAD VCF
========================= */

app.get("/api/vcard/:id/vcf", async (req, res) => {

  const { data } = await supabase
    .from("vcards")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!data) return res.status(404).send("Not found");

  const vcf = `
BEGIN:VCARD
VERSION:3.0
FN:${data.fullName}
ORG:${data.organization}
TITLE:${data.jobTitle}
END:VCARD
`;

  res.setHeader("Content-Type", "text/vcard");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${data.fullName}.vcf"`
  );

  res.send(vcf);

});

/* =========================
   QR CODE
========================= */

app.get("/api/vcard/:id/qr", async (req, res) => {

  const url = `https://oiwistudio.com/pages/vcard-preview?card=${req.params.id}`;

  const qr = await QRCode.toDataURL(url);

  res.send(`<img src="${qr}" />`);

});

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.send("vCard backend running");
});

/* =========================
   START SERVER
========================= */

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
