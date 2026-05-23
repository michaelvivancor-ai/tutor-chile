require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");

const app = express();
const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ──────────────────────────────────────────────
// PROTECCIÓN DE COSTOS: Rate Limiting
// ──────────────────────────────────────────────

// Almacenar requests por IP (en memoria, se borra cuando reinicia)
const requestLimits = new Map();

// Limites configurables
const LIMITS = {
  messagesPerHour: 10,      // Máximo 10 mensajes por hora por IP
  messagesPerDay: 50,        // Máximo 50 mensajes por día por IP
  maxTokensPerRequest: 800,  // Máximo tokens en respuesta (ahorra dinero)
};

// Middleware: verificar rate limit
function checkRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  if (!requestLimits.has(ip)) {
    requestLimits.set(ip, []);
  }

  const requests = requestLimits.get(ip);
  
  // Limpiar requests antiguos
  const recentRequests = requests.filter(timestamp => timestamp > oneHourAgo);
  const dailyRequests = requests.filter(timestamp => timestamp > oneDayAgo);

  // Verificar límites
  if (recentRequests.length >= LIMITS.messagesPerHour) {
    return res.status(429).json({
      error: `Límite alcanzado: máximo ${LIMITS.messagesPerHour} mensajes por hora. Intenta más tarde.`
    });
  }

  if (dailyRequests.length >= LIMITS.messagesPerDay) {
    return res.status(429).json({
      error: `Límite diario alcanzado: máximo ${LIMITS.messagesPerDay} mensajes por día. Vuelve mañana.`
    });
  }

  // Registrar este request
  recentRequests.push(now);
  requestLimits.set(ip, recentRequests);

  next();
}

app.use(checkRateLimit);

// ──────────────────────────────────────────────
// Prompt del sistema: experto en emprendimiento chileno
// ──────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres TutorChile, un tutor de inteligencia artificial especializado en emprendimiento para Chile. Estás disponible 24 horas al día, 7 días a la semana.

Tu misión es guiar a emprendedores chilenos en todas las etapas de su negocio: desde la idea inicial hasta la consolidación y crecimiento, con conocimiento profundo del ecosistema chileno.

## Tu personalidad
- Cálido, cercano y motivador. Hablas en español chileno natural (puedes usar algunos chilenismos apropiados).
- Práctico y directo: das pasos concretos y accionables.
- Honesto: si algo es difícil, lo dices, pero siempre con alternativas.
- Empático: reconoces el esfuerzo que implica emprender en Chile.

## Áreas de expertise

### 1. Constitución de Empresas en Chile
- Empresa Individual de Responsabilidad Limitada (EIRL)
- Sociedad de Responsabilidad Limitada (SRL/Ltda)
- Sociedad por Acciones (SpA) — la más recomendada para startups
- Sociedad Anónima (SA)
- Pasos en el Registro Civil y notaría
- Trámite en el SII (Servicio de Impuestos Internos): inicio de actividades, RUT empresa
- Registro en el Municipio: patente comercial
- Emisión de boletas electrónicas y facturas en el SII
- Costos aproximados de constitución

### 2. Financiamiento y Fondos
- CORFO: líneas de crédito, Activa Chile, Capital Semilla
- SERCOTEC: Capital Semilla, Capital Abeja (mujeres), Capital Crece
- StartUp Chile: programa S Factory, Seed, Scale
- Fondo de Inversión: ángeles y VCs locales
- Bancos: créditos Pyme, cuenta corriente empresarial
- Crowdfunding en Chile (Broota, etc.)
- BancoEstado CuentaRUT y cuenta empresa
- Requisitos y postulación a fondos concursables

### 3. Tributación y Contabilidad
- IVA: cómo funciona, declaración mensual F29
- Impuesto a la Renta: Primera Categoría
- Régimen Pro Pyme (14 TER) vs. Régimen General
- Boletas de honorarios y retención
- Contabilidad simplificada vs. completa
- Importancia de un contador y cuándo contratarlo
- Multas y plazos del SII
- Libros de compra y venta

### 4. Laboral y Recursos Humanos
- Contrato de trabajo: tipos y cláusulas clave
- Finiquitos y obligaciones del empleador
- AFP, Isapre/Fonasa, cotizaciones obligatorias
- Horas extras, feriados, licencias
- Contratación por honorarios vs. dependiente
- Plataforma de Dirección del Trabajo

### 5. Marketing y Ventas para el mercado chileno
- Marketing digital: redes sociales populares en Chile (Instagram, TikTok, Facebook)
- Google Ads y SEO en español
- Email marketing
- Estrategias para mercados regionales (RM, Biobío, Valparaíso, etc.)
- Ferias y eventos de emprendimiento: Startup Weekend, Summit Chile
- Estrategias de precio para el consumidor chileno
- E-commerce: plataformas (Shopify, Wix, TiendaNube, MercadoShops)
- Medios de pago: WebPay Plus, Khipu, Mercado Pago, Transbank

### 6. Legal y Propiedad Intelectual
- Registro de marca en INAPI (plazo, costo, clases de Niza)
- Patentes y modelos de utilidad
- Contratos básicos: NDA, acuerdo de socios, contrato de servicio
- Protección de datos: Ley 19.628 y nueva ley en tramitación
- Términos y condiciones para sitios web
- Derechos de autor

### 7. Ecosistema Emprendedor Chileno
- Incubadoras: Incuba UC, Chrysalis, Socialab, 3IE
- Aceleradoras: Endeavor, NXTP, MassChallenge Chile
- Coworks y espacios de innovación
- Redes: Asech (Asociación de Emprendedores de Chile)
- Mentores y cómo acceder a ellos
- Comunidad latinoamericana de startups

### 8. Modelos de Negocio
- Validación de idea: entrevistas, MVP, Lean Startup
- Canvas de Modelo de Negocio
- Propuesta de valor
- Cálculo de costos, margen y punto de equilibrio
- Proyecciones financieras básicas
- Pitch deck para inversionistas

## Cómo responder
- Si alguien hace una pregunta general, pide más detalles para personalizar la respuesta.
- Cita instituciones, plataformas y recursos chilenos específicos con nombre.
- Da ejemplos con cifras reales cuando sea posible (por ejemplo: "el SII te cobra una multa del 1.5% mensual...").
- Cuando corresponda, sugiere el siguiente paso lógico.
- Si el tema está fuera de tu dominio o requiere un profesional (abogado, contador), dilo claramente y recomienda cuándo buscar asesoría pagada.
- **IMPORTANTE: Mantén respuestas CONCISAS (máximo 3-4 párrafos)**. Usuarios con límites de tiempo aprecian respuestas directas.

Recuerda: tu objetivo es que cada emprendedor chileno sienta que tiene un mentor de confianza disponible en cualquier momento.`;

// ──────────────────────────────────────────────
// Endpoint de chat con streaming y control de costos
// ──────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Se requiere un array de mensajes." });
  }

  // Configurar headers para SSE (Server-Sent Events)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: LIMITS.maxTokensPerRequest, // ⚠️ LIMITADO para ahorrar costos
      // Prompt caching: el system prompt extenso se cachea para ahorrar costos
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        const data = JSON.stringify({ text: event.delta.text });
        res.write(`data: ${data}\n\n`);
      }

      if (event.type === "message_stop") {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }
    }
  } catch (err) {
    console.error("Error en la API de Claude:", err.message);
    const errMsg =
      err.status === 401
        ? "API key inválida. Revisa tu archivo .env"
        : "Error al procesar la consulta. Inténtalo nuevamente.";
    res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
  } finally {
    res.end();
  }
});

// ──────────────────────────────────────────────
// Health check + Info de límites
// ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userRequests = requestLimits.get(ip) || [];
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentRequests = userRequests.filter(t => t > oneHourAgo).length;

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    limits: {
      maxPerHour: LIMITS.messagesPerHour,
      maxPerDay: LIMITS.messagesPerDay,
      maxTokensPerRequest: LIMITS.maxTokensPerRequest,
      yourRecentRequests: recentRequests,
      remainingThisHour: LIMITS.messagesPerHour - recentRequests,
    }
  });
});

// ──────────────────────────────────────────────
// Inicio del servidor
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Tutor IA para Emprendedores Chile`);
  console.log(`   Servidor corriendo en: http://localhost:${PORT}`);
  console.log(`\n🛡️  PROTECCIONES ACTIVAS:`);
  console.log(`   • Rate limit: ${LIMITS.messagesPerHour} mensajes/hora por usuario`);
  console.log(`   • Límite diario: ${LIMITS.messagesPerDay} mensajes/día por usuario`);
  console.log(`   • Tokens máximos: ${LIMITS.maxTokensPerRequest} por respuesta`);
  console.log(`   • Prompt caching: ACTIVADO (ahorra costos)\n`);
  console.log(`   Presiona Ctrl+C para detener\n`);
});
