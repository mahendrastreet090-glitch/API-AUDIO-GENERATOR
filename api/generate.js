import { GoogleGenAI } from '@google/genai';
import { getAllAudioBase64 } from 'google-tts-api';

export default async function handler(req, res) {
  // Enabler CORS untuk Akses Bot WhatsApp & Web
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { text, vibe = 'ceria', gender = 'wanita', speed = 1.0 } = req.body || {};

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'Teks narasi wajib diisi.' });
    }

    let optimizedText = text;

    // 1. Analisis & Refinemen Bahasa oleh Gemini (Jika API Key ada)
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const systemPrompt = `Kamu adalah pakar fonetik dan pengarah vokal Bahasa Indonesia.
Tugasmu: Analisis teks input dan sesuaikan ekspresi, intonasi, tanda baca, serta jeda fonetis agar terdengar alami dengan logat Indonesia.
Aturan Vibe:
- ceria: Tambahkan tanda seru, intonasi naik dan dinamis.
- sedih: Perlambat tempo kata, tambahkan tanda titik/koma lebih banyak untuk efek jeda bernapas.
- puitis: Berikan penekanan kata, tempo sedang dengan jeda dramatis (...).
- misterius: Gunakan intonasi datar, jeda panjang, dan nada berat.

Karakter Suara: ${gender}
Target Vibe: ${vibe}

Kembalikan HANYA teks hasil optimasi tanpa komentar tambahan.
Teks Asli: ${text}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: systemPrompt,
        });

        if (response && response.text) {
          optimizedText = response.text.trim();
        }
      } catch (geminiErr) {
        console.warn('Gemini AI error/fallback to raw text:', geminiErr.message);
        // Tetap lanjut menggunakan teks asli jika Gemini error
      }
    }

    // 2. Generate Audio tanpa batas karakter (memecah teks otomatis jika > 200 karakter)
    const audioParts = await getAllAudioBase64(optimizedText, {
      lang: 'id',
      slow: parseFloat(speed) < 0.9,
      host: 'https://translate.google.com',
      timeout: 15000,
      splitPunct: '.,?!;\n'
    });

    // 3. Gabungkan seluruh chunk audio base64 menjadi satu file audio
    const audioBuffers = audioParts.map((part) => Buffer.from(part.base64, 'base64'));
    const combinedBuffer = Buffer.concat(audioBuffers);
    const combinedBase64 = combinedBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      vibe,
      gender,
      speed,
      processedText: optimizedText,
      audioUrl: `data:audio/mp3;base64,${combinedBase64}`,
      base64: combinedBase64
    });

  } catch (error) {
    console.error('Error generating audio:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan pada server.'
    });
  }
}

