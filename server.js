import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors());
app.use(express.json());

/* ===============================
   SUPABASE CONNECTION
================================ */

const SUPABASE_URL = "https://eivrsuzrvldljpecavqv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnJzdXpydmxkbGpwZWNhdnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NDg5NTMsImV4cCI6MjA4OTAyNDk1M30.9zmECLy60FUsZWnGm37ckAzvj-q1RnuHG2-5G2Ks1UY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===============================
   CREATE NEW VCARD
================================ */

app.post("/api/vcard", async (req, res) => {
  try {

    const id = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    const payload = {
      id,
      firstName: req.body.firstName || null,
      lastName: req.body.lastName || null,
      fullName: req.body.fullName || null,
      organization: req.body.organization || null,
      jobTitle: req.body.jobTitle || null,
      birthday: req.body.birthday || null,
      note: req.body.note || null,
      photo: req.body.photo || null,
      fields: req.body.fields || null
    };

    const { data, error } = await supabase
      .from("vcards")
      .insert([payload])
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ id });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   GET VCARD JSON
================================ */

app.get("/api/vcard/:id/json", async (req, res) => {

  try {

    const { data, error } = await supabase
      .from("vcards")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).send("Card not found");
    }

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }

});

/* ===============================
   DOWNLOAD VCARD (.VCF)
================================ */

app.get("/api/vcard/:id/vcf", async (req, res) => {

  try {

    const { data, error } = await supabase
      .from("vcards")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).send("Card not found");
    }

    let vcf = `
BEGIN:VCARD
VERSION:3.0
FN:${data.fullName || ""}
ORG:${data.organization || ""}
TITLE:${data.jobTitle || ""}
`;

    if (Array.isArray(data.fields)) {

      data.fields.forEach(field => {

        if (field.type === "phone")
          vcf += `TEL:${field.value}\n`;

        if (field.type === "email")
          vcf += `EMAIL:${field.value}\n`;

        if (field.type === "url")
          vcf += `URL:${field.value}\n`;

        if (field.type === "address")
          vcf += `ADR:;;${field.value};;;;\n`;

      });

    }

    vcf += "END:VCARD";

    res.setHeader("Content-Type", "text/vcard");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${data.fullName || "contact"}.vcf"`
    );

    res.send(vcf);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }

});

/* ===============================
   QR CODE GENERATOR
================================ */

app.get("/api/vcard/:id/qr", async (req, res) => {

  try {

    const url =
      `https://oiwistudio.com/pages/vcard-preview?card=${req.params.id}`;

    const qr = await QRCode.toDataURL(url);

    res.send(`<img src="${qr}" />`);

  } catch (err) {
    console.error(err);
    res.status(500).send("QR generation error");
  }

});

/* ===============================
   START SERVER
================================ */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
