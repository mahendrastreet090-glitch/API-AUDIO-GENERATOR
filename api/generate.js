import { GoogleGenAI } from '@google/genai';
import { getAudioUrl } from 'google-tts-api';

const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8RN6I0_4DsJOnuFwRoFWnKb4IpuSkxD-vb0wd8276lZUENdw' });

export default async function handler(req, res) {
  // Enabler CORS untuk Akses Bot WhatsApp & Web
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { text, vibe = 'ceria', gender = 'wanita', speed = 1.0 } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: 'Teks narasi wajib diisi.' });
    }

    // 1. Analisis & Refinemen Bahasa oleh Logika Gemini
    const systemPrompt = `Kamu adalah pakar fonetik dan pengarah vokal Bahasa Indonesia.
Tugasmu: Analisis teks input dan sesuaikan ekspresi, intonasi, tanda baca, serta jeda fonetis agar terdengar alami dengan logat Indonesia.
Aturan Vibe:
- ceria: Tambahkan tanda seru, intonasi naik dan dinamis.
- sedih: Perlambat tempo kata, tambahkan tanda titik/koma lebih banyak untuk efek jeda bernapas.
- puitis: Berikan penekanan kata, tempo sedang dengan jeda dramatis (...).
- misterius: Gunakan intonasi datar, jeda panjang, dan nada berat.

Karakter Suara: ${gender}
Target Vibe: ${vibe}

Kembalikan HANYA teks hasil optimasi tanpa komentar tambahan.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }, { text: `Teks Asli: ${text}` }] }
      ]
    });

    const optimizedText = response.text || text;

    // 2. Pemilihan Suara Berdasarkan Kode Bahasa Indonesia
    // id-ID default untuk aksen & dialek Indonesia
    const langCode = 'id';

    // 3. Generasi Audio URL
    const audioUrl = getAudioUrl(optimizedText, {
      lang: langCode,
      slow: parseFloat(speed) < 0.9,
      host: 'https://translate.google.com',
      timeout: 10000,
    });

    // Fetched Audio untuk Konversi Buffer Wav/Base64
    const audioStream = await fetch(audioUrl);
    const arrayBuffer = await audioStream.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({
      success: true,
      vibe,
      gender,
      speed,
      processedText: optimizedText,
      audioUrl: `data:audio/wav;base64,${base64Audio}`,
      base64: base64Audio
    });

  } catch (error) {
    console.error('Error generating audio:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
