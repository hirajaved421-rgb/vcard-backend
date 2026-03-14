import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 PASTE YOUR REAL SUPABASE VALUES HERE
const SUPABASE_URL = "https://eivrsuzrvldljpecavqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnJzdXpydmxkbGpwZWNhdnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NDg5NTMsImV4cCI6MjA4OTAyNDk1M30.9zmECLy60FUsZWnGm37ckAzvj-q1RnuHG2-5G2Ks1UY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Create new vCard
app.post("/api/vcard", async (req, res) => {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await supabase
    .from("vcards")
    .insert([{ id, ...req.body }]);

  if (error) return res.status(500).json(error);

  res.json({ id });
});

// Get JSON
app.get("/api/vcard/:id/json", async (req, res) => {
  const { data } = await supabase
    .from("vcards")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!data) return res.status(404).send("Not found");

  res.json(data);
});

// Get VCF
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
TEL:${data.phone}
EMAIL:${data.email}
URL:${data.website}
END:VCARD
`;

  res.setHeader("Content-Type", "text/vcard");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${data.fullName}.vcf"`
  );

  res.send(vcf);
});

// Get QR
app.get("/api/vcard/:id/qr", async (req, res) => {
  const url = `https://oiwistudio.com/pages/vcard-preview?card=${req.params.id}`;
  const qr = await QRCode.toDataURL(url);
  res.send(`<img src="${qr}" />`);
});

app.listen(3000, () => console.log("Server running on port 3000"));