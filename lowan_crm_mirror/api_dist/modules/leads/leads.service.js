"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadsService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../../config/database");
const common_types_1 = require("../../types/common.types");
const logger_1 = require("../../config/logger");
const env_1 = require("../../config/env");
const token_encryption_1 = require("../../services/crypto/token.encryption");
const cloud_api_service_1 = require("../../services/whatsapp/cloud-api.service");
const kanban_service_1 = require("../../modules/kanban/kanban.service");
const client_1 = require("@prisma/client");
const redis_1 = require("../../config/redis");
const phone_normalizer_1 = require("../../utils/phone.normalizer");
function canonicalBrazilianPhone(phone) {
    return (0, phone_normalizer_1.normalizePhone)(phone).normalized ?? '';
}
const DEFAULT_PERMS = { viewAllLeads: false, manageLeads: false, exportLeads: false, manageKanban: false, manageUsers: false, viewReports: false };
/**
 * Verifica se a conexão atingiu o limite diário de envio de templates (primeira mensagem).
 * Usa chave Redis exclusiva — independente do contador de campanhas.
 * Lança HttpError se o limite foi atingido.
 */
async function checkAndIncrementTemplateDailyLimit(connectionId, rateLimitPerDay) {
    if (!rateLimitPerDay || rateLimitPerDay <= 0)
        return;
    const key = redis_1.RedisKeys.rateConnTplDay(connectionId);
    const sentToday = parseInt((await redis_1.redis.get(key)) ?? '0');
    if (sentToday >= rateLimitPerDay) {
        throw common_types_1.HttpError.badRequest(`Limite diário de ${rateLimitPerDay} templates atingido para esta conexão. Tente novamente amanhã.`);
    }
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
    const pipeline = redis_1.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttl);
    await pipeline.exec();
}
/**
 * Rewrites an OGG/Opus file to match RecorderJS format exactly:
 * - pre_skip = 3840, vendor = "RecorderJS", 0 comments
 * - Pages of exactly 40 Opus frames (800ms), granpos multiples of 38400
 * Meta preserves RecorderJS files as-is; WhatsApp renders waveform from them.
 */
async function repackAsRecorderJS(inputOgg) {
    const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
    const { tmpdir } = await Promise.resolve().then(() => __importStar(require('os')));
    const { writeFile, readFile, unlink } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
    const id = `rjs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inPath = `${tmpdir()}/${id}_in.ogg`;
    const pcmPath = `${tmpdir()}/${id}.raw`;
    await writeFile(inPath, inputOgg);
    try {
        // Decode to raw PCM 48kHz mono s16le
        await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', inPath, '-ar', '48000', '-ac', '1', '-f', 's16le', pcmPath], (err) => err ? reject(err) : resolve()));
        const pcm = await readFile(pcmPath);
        // Re-encode with opusenc using RecorderJS-compatible settings
        const wavPath = `${tmpdir()}/${id}.wav`;
        const outPath = `${tmpdir()}/${id}_out.ogg`;
        // Write WAV header + PCM
        const wavBuf = Buffer.allocUnsafe(44 + pcm.length);
        wavBuf.write('RIFF', 0);
        wavBuf.writeUInt32LE(36 + pcm.length, 4);
        wavBuf.write('WAVE', 8);
        wavBuf.write('fmt ', 12);
        wavBuf.writeUInt32LE(16, 16);
        wavBuf.writeUInt16LE(1, 20); // PCM
        wavBuf.writeUInt16LE(1, 22);
        wavBuf.writeUInt32LE(48000, 24);
        wavBuf.writeUInt32LE(96000, 28);
        wavBuf.writeUInt16LE(2, 32);
        wavBuf.writeUInt16LE(16, 34);
        wavBuf.write('data', 36);
        wavBuf.writeUInt32LE(pcm.length, 40);
        pcm.copy(wavBuf, 44);
        await writeFile(wavPath, wavBuf);
        // Encode with ffmpeg libopus - framesize 20ms, 40 frames/page = 800ms pages → granpos multiples of 38400
        await new Promise((resolve, reject) => execFile('ffmpeg', [
            '-y', '-i', wavPath,
            '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000',
            '-frame_duration', '20',
            outPath,
        ], (err, _o, stderr) => err ? (logger_1.logger.warn({ stderr }, 'ffmpeg libopus rjs encode failed'), reject(err)) : resolve()));
        const encoded = await readFile(outPath);
        // Patch: pre_skip=3840, vendor="RecorderJS", 0 comments
        const patched = patchOggForRecorderJS(encoded);
        logger_1.logger.info({ inBytes: inputOgg.length, outBytes: patched.length }, 'Repacked as RecorderJS');
        await unlink(wavPath).catch(() => { });
        await unlink(outPath).catch(() => { });
        return patched;
    }
    finally {
        await unlink(inPath).catch(() => { });
        await unlink(pcmPath).catch(() => { });
    }
}
function buildOggPage(serial, seqNum, granule, packets, headerType) {
    // Build lacing (segment table) for packets
    const segs = [];
    for (const pkt of packets) {
        let rem = pkt.length;
        while (rem >= 255) {
            segs.push(255);
            rem -= 255;
        }
        segs.push(rem); // terminating segment (may be 0)
    }
    const data = Buffer.concat(packets);
    const hdr = Buffer.allocUnsafe(27 + segs.length);
    hdr.write('OggS', 0, 'ascii');
    hdr[4] = 0; // version
    hdr[5] = headerType;
    hdr.writeBigInt64LE(granule, 6);
    hdr.writeUInt32LE(serial, 14);
    hdr.writeUInt32LE(seqNum, 18);
    hdr.writeUInt32LE(0, 22); // CRC placeholder
    hdr[26] = segs.length;
    for (let i = 0; i < segs.length; i++)
        hdr[27 + i] = segs[i];
    const page = Buffer.concat([hdr, data]);
    page.writeUInt32LE(oggCrc32(page), 22);
    return page;
}
function patchOggForRecorderJS(oggBuf) {
    // Parse all pages
    const allPages = [];
    let pos = 0;
    while (pos + 27 <= oggBuf.length && oggBuf.toString('ascii', pos, pos + 4) === 'OggS') {
        const nseg = oggBuf[pos + 26];
        let dlen = 0;
        for (let s = 0; s < nseg; s++)
            dlen += oggBuf[pos + 27 + s];
        const granule = oggBuf.readBigInt64LE(pos + 6);
        const htype = oggBuf[pos + 5];
        const serial = oggBuf.readUInt32LE(pos + 14);
        allPages.push({ start: pos, end: pos + 27 + nseg + dlen, granule, htype, nseg, serial });
        pos = allPages[allPages.length - 1].end;
    }
    if (allPages.length < 3)
        return oggBuf;
    const serial = allPages[0].serial;
    // ── Page 0: OpusHead with pre_skip=3840 ──────────────────────────────────
    const headPage = Buffer.from(oggBuf.subarray(allPages[0].start, allPages[0].end));
    const hNseg = headPage[26];
    const hOff = 27 + hNseg;
    if (headPage.toString('ascii', hOff, hOff + 8) === 'OpusHead') {
        headPage.writeUInt16LE(3840, hOff + 10);
        headPage.writeUInt32LE(0, 22);
        headPage.writeUInt32LE(oggCrc32(headPage), 22);
    }
    // ── Page 1: OpusTags vendor="RecorderJS", 0 comments ─────────────────────
    const vendor = Buffer.from('RecorderJS', 'utf8');
    const vLen = Buffer.allocUnsafe(4);
    vLen.writeUInt32LE(vendor.length, 0);
    const cnt = Buffer.allocUnsafe(4);
    cnt.writeUInt32LE(0, 0);
    const tagsPayload = Buffer.concat([Buffer.from('OpusTags'), vLen, vendor, cnt]);
    const tagsPage = buildOggPage(serial, 1, 0n, [tagsPayload], 0);
    // ── Extract all Opus packets from audio pages ─────────────────────────────
    const allPackets = [];
    for (let i = 2; i < allPages.length; i++) {
        const p = allPages[i];
        const nseg = oggBuf[p.start + 26];
        const segTable = Array.from(oggBuf.subarray(p.start + 27, p.start + 27 + nseg));
        let dataPos = p.start + 27 + nseg;
        let pktBufs = [];
        for (const s of segTable) {
            pktBufs.push(oggBuf.subarray(dataPos, dataPos + s));
            dataPos += s;
            if (s < 255) {
                allPackets.push(Buffer.concat(pktBufs));
                pktBufs = [];
            }
        }
        // continued packet at end of page (EOS or partial)
        if (pktBufs.length > 0 && pktBufs.some(b => b.length > 0)) {
            allPackets.push(Buffer.concat(pktBufs));
        }
    }
    // ── Repack packets into pages of exactly 40 packets each ─────────────────
    const FRAMES_PER_PAGE = 40;
    const GRANULE_PER_PAGE = BigInt(38400); // 40 × 960 samples @ 48kHz
    const audioPages = [];
    let seqNum = 2;
    let granule = GRANULE_PER_PAGE;
    const isEOS = allPages[allPages.length - 1].htype & 0x04;
    for (let i = 0; i < allPackets.length; i += FRAMES_PER_PAGE) {
        const chunk = allPackets.slice(i, i + FRAMES_PER_PAGE);
        const isLast = i + FRAMES_PER_PAGE >= allPackets.length;
        let pageGranule = granule;
        if (isLast) {
            // Last page: use original last granule
            pageGranule = allPages[allPages.length - 1].granule;
        }
        const htype = (isLast && isEOS) ? 0x04 : 0x00;
        audioPages.push(buildOggPage(serial, seqNum++, pageGranule, chunk, htype));
        granule += GRANULE_PER_PAGE;
    }
    return Buffer.concat([headPage, tagsPage, ...audioPages]);
}
/** OGG CRC-32 (polynomial 0x04c11db7, big-endian) */
function oggCrc32(buf) {
    const T = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i << 24;
        for (let j = 0; j < 8; j++)
            c = (c & 0x80000000) ? (((c << 1) >>> 0) ^ 0x04c11db7) : ((c << 1) >>> 0);
        T[i] = c;
    }
    let crc = 0;
    for (let i = 0; i < buf.length; i++)
        crc = (((crc << 8) >>> 0) ^ T[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
    return crc;
}
/**
 * Patches OGG/Opus to mirror the exact structure produced by Kommo/RecorderJS:
 *  - OpusHead: pre_skip = 3840 (RecorderJS signature)
 *  - OpusTags: vendor = "RecorderJS", 0 comments
 * WhatsApp uses these signals to render the waveform visualization.
 */
function embedOpusWaveform(oggBuf, _waveformB64) {
    // Locate page 0 (OpusHead) and page 1 (OpusTags)
    const pages = [];
    let pos = 0;
    while (pos + 27 <= oggBuf.length && oggBuf.toString('ascii', pos, pos + 4) === 'OggS') {
        const nseg = oggBuf[pos + 26];
        let dataLen = 0;
        for (let s = 0; s < nseg; s++)
            dataLen += oggBuf[pos + 27 + s];
        const end = pos + 27 + nseg + dataLen;
        pages.push({ start: pos, end });
        pos = end;
        if (pages.length === 2)
            break;
    }
    if (pages.length < 2)
        return oggBuf;
    // ── Patch page 0: OpusHead pre_skip → 3840 ──────────────────────────────
    const head0 = pages[0];
    const headPage = Buffer.from(oggBuf.subarray(head0.start, head0.end));
    const headNseg = headPage[26];
    const headPayloadOff = 27 + headNseg;
    if (headPage.toString('ascii', headPayloadOff, headPayloadOff + 8) === 'OpusHead') {
        headPage.writeUInt16LE(3840, headPayloadOff + 10); // pre_skip offset in OpusHead
        headPage.writeUInt32LE(0, 22);
        headPage.writeUInt32LE(oggCrc32(headPage), 22);
    }
    // ── Patch page 1: OpusTags → vendor="RecorderJS", 0 comments ────────────
    const tags1 = pages[1];
    const origTagsPage = oggBuf.subarray(tags1.start, tags1.end);
    const tagsNseg = origTagsPage[26];
    const tagsPayloadOff = 27 + tagsNseg;
    if (origTagsPage.toString('ascii', tagsPayloadOff, tagsPayloadOff + 8) !== 'OpusTags')
        return oggBuf;
    const vendor = Buffer.from('RecorderJS', 'utf8');
    const vendorLen = Buffer.allocUnsafe(4);
    vendorLen.writeUInt32LE(vendor.length, 0);
    const commentCount = Buffer.allocUnsafe(4);
    commentCount.writeUInt32LE(0, 0);
    const newPayload = Buffer.concat([Buffer.from('OpusTags'), vendorLen, vendor, commentCount]);
    const segs = [];
    let rem = newPayload.length;
    while (rem >= 255) {
        segs.push(255);
        rem -= 255;
    }
    segs.push(rem);
    const newTagsHeader = Buffer.allocUnsafe(27 + segs.length);
    origTagsPage.copy(newTagsHeader, 0, 0, 27);
    newTagsHeader[26] = segs.length;
    for (let i = 0; i < segs.length; i++)
        newTagsHeader[27 + i] = segs[i];
    newTagsHeader.writeUInt32LE(0, 22);
    const newTagsPage = Buffer.concat([newTagsHeader, newPayload]);
    newTagsPage.writeUInt32LE(oggCrc32(newTagsPage), 22);
    return Buffer.concat([headPage, newTagsPage, oggBuf.subarray(tags1.end)]);
}
/**
 * Generates 64-sample waveform from raw OGG and embeds it as WhatsApp expects.
 * Falls back to original buffer on any error.
 */
async function addWhatsAppWaveform(oggBuf) {
    logger_1.logger.info({ bytes: oggBuf.length }, 'addWhatsAppWaveform: start');
    const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
    const { tmpdir } = await Promise.resolve().then(() => __importStar(require('os')));
    const { writeFile, readFile, unlink } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const oggIn = `${tmpdir()}/${id}_in.ogg`;
    const pcmPath = `${tmpdir()}/${id}.pcm`;
    await writeFile(oggIn, oggBuf);
    try {
        // Decode to raw PCM for waveform calculation
        await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', oggIn, '-ar', '8000', '-ac', '1', '-f', 's16le', pcmPath], (err) => err ? reject(err) : resolve()));
        const pcmRaw = await readFile(pcmPath);
        const samples = new Int16Array(pcmRaw.buffer, pcmRaw.byteOffset, pcmRaw.byteLength >> 1);
        const NUM = 64;
        const segLen = Math.max(1, Math.floor(samples.length / NUM));
        const waveform = new Uint8Array(NUM);
        let globalMax = 0;
        for (let i = 0; i < NUM; i++) {
            const s = i * segLen;
            const e = Math.min(s + segLen, samples.length);
            let sumSq = 0;
            for (let j = s; j < e; j++)
                sumSq += (samples[j] / 32768) ** 2;
            const rms = Math.sqrt(sumSq / (e - s));
            waveform[i] = Math.round(rms * 255);
            if (waveform[i] > globalMax)
                globalMax = waveform[i];
        }
        if (globalMax > 0) {
            for (let i = 0; i < NUM; i++)
                waveform[i] = Math.round((waveform[i] / globalMax) * 255);
        }
        const b64 = Buffer.from(waveform).toString('base64');
        logger_1.logger.info({ waveformLen: NUM, peak: globalMax }, 'Waveform generated, embedding via opustags');
        // Embed WAVEFORM tag directly into the OGG OpusTags packet
        const result = embedOpusWaveform(oggBuf, b64);
        logger_1.logger.info({ outBytes: result.length }, 'Waveform embedded successfully');
        return result;
    }
    catch (err) {
        logger_1.logger.error({ err }, 'addWhatsAppWaveform failed, using buffer without waveform');
        return oggBuf;
    }
    finally {
        await unlink(oggIn).catch(() => { });
        await unlink(pcmPath).catch(() => { });
    }
}
/** Incrementa os contadores de uso do dia (Redis + DB) para uma conexão. */
async function incrementConnectionCounters(connectionId) {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000);
    const pipeline = redis_1.redis.pipeline();
    pipeline.incr(redis_1.RedisKeys.rateConnDay(connectionId));
    pipeline.expire(redis_1.RedisKeys.rateConnDay(connectionId), secondsUntilMidnight);
    pipeline.incr(redis_1.RedisKeys.rateConnMin(connectionId));
    pipeline.expire(redis_1.RedisKeys.rateConnMin(connectionId), 60);
    await pipeline.exec();
    await database_1.prisma.whatsappConnection.update({
        where: { id: connectionId },
        data: { messagesSentToday: { increment: 1 } },
    });
}
class LeadsService {
    app;
    constructor(app) {
        this.app = app;
    }
    // ─── Auth ──────────────────────────────────────────────────────────────────
    async hasAnyUser(workspaceSlug) {
        if (!workspaceSlug) {
            const count = await database_1.prisma.leadUser.count();
            return count > 0;
        }
        const workspace = await database_1.prisma.workspace.findUnique({ where: { slug: workspaceSlug.toLowerCase() } });
        if (!workspace)
            return false;
        const count = await database_1.prisma.leadUser.count({ where: { workspaceId: workspace.id } });
        return count > 0;
    }
    async setup(input) {
        const workspace = await database_1.prisma.workspace.findUnique({ where: { slug: input.workspaceSlug.toLowerCase() } });
        if (!workspace)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        if (!workspace.isActive)
            throw common_types_1.HttpError.forbidden('Workspace inativo');
        const count = await database_1.prisma.leadUser.count({ where: { workspaceId: workspace.id } });
        if (count > 0)
            throw common_types_1.HttpError.conflict('Admin já configurado');
        const passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        const user = await database_1.prisma.leadUser.create({
            data: {
                name: input.name,
                email: input.email.toLowerCase(),
                passwordHash,
                role: 'ADMIN',
                workspaceId: workspace.id,
            },
        });
        const token = this.app.jwt.sign({ sub: user.id, role: user.role, type: 'lead', workspaceId: workspace.id }, { expiresIn: '30d' });
        return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
    async identifyWorkspaces(email, password) {
        const users = await database_1.prisma.leadUser.findMany({
            where: { email: email.toLowerCase() },
            select: {
                id: true, name: true, email: true, role: true, isActive: true, passwordHash: true, permissions: true,
                workspace: { select: { id: true, name: true, slug: true, isActive: true } },
            },
        });
        if (users.length === 0)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        // Verifica a senha em paralelo para todos os workspaces
        const results = await Promise.all(users.map(async (u) => {
            const valid = await bcryptjs_1.default.compare(password, u.passwordHash);
            return valid ? u : null;
        }));
        const valid = results.filter(Boolean);
        if (valid.length === 0)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        // Retorna lista de workspaces disponíveis (apenas ativos)
        const workspaces = valid
            .filter(u => u.isActive && u.workspace.isActive)
            .map(u => ({
            workspaceId: u.workspace.id,
            workspaceName: u.workspace.name,
            workspaceSlug: u.workspace.slug,
            userId: u.id,
            userName: u.name,
            role: u.role,
        }));
        if (workspaces.length === 0)
            throw common_types_1.HttpError.unauthorized('Sua conta está inativa');
        // Se só há 1 workspace, já emite o token diretamente
        if (workspaces.length === 1) {
            const w = workspaces[0];
            const u = valid.find(u => u.workspace.id === w.workspaceId);
            const token = this.app.jwt.sign({ sub: u.id, role: u.role, type: 'lead', workspaceId: w.workspaceId, permissions: u.permissions ?? {} }, { expiresIn: '30d' });
            return {
                workspaces,
                autoLogin: { token, user: { id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions ?? {} } },
            };
        }
        return { workspaces, autoLogin: null };
    }
    async login(input) {
        const workspace = await database_1.prisma.workspace.findUnique({ where: { slug: input.workspaceSlug.toLowerCase() } });
        if (!workspace || !workspace.isActive)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const user = await database_1.prisma.leadUser.findUnique({
            where: { workspaceId_email: { workspaceId: workspace.id, email: input.email.toLowerCase() } },
        });
        if (!user || !user.isActive)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const valid = await bcryptjs_1.default.compare(input.password, user.passwordHash);
        if (!valid)
            throw common_types_1.HttpError.unauthorized('Credenciais inválidas');
        const token = this.app.jwt.sign({ sub: user.id, role: user.role, type: 'lead', workspaceId: workspace.id, permissions: user.permissions ?? {} }, { expiresIn: '30d' });
        return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions ?? {} } };
    }
    // ─── User management (admin only) ─────────────────────────────────────────
    async listUsers(workspaceId) {
        return database_1.prisma.leadUser.findMany({
            where: { workspaceId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, permissions: true },
        });
    }
    async createUser(input, workspaceId) {
        const existing = await database_1.prisma.leadUser.findUnique({
            where: { workspaceId_email: { workspaceId, email: input.email.toLowerCase() } },
        });
        if (existing)
            throw common_types_1.HttpError.conflict('E-mail já cadastrado');
        const passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        return database_1.prisma.leadUser.create({
            data: {
                name: input.name,
                email: input.email.toLowerCase(),
                passwordHash,
                role: input.role ?? 'COLLABORATOR',
                workspaceId,
                ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
            },
            select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true, createdAt: true },
        });
    }
    async updateUser(id, input, workspaceId, requestingUserId) {
        const user = await database_1.prisma.leadUser.findFirst({ where: { id, workspaceId } });
        if (!user)
            throw common_types_1.HttpError.notFound('Usuário não encontrado');
        const data = {};
        if (input.name)
            data.name = input.name;
        if (input.email) {
            const existing = await database_1.prisma.leadUser.findUnique({
                where: { workspaceId_email: { workspaceId, email: input.email.toLowerCase() } },
            });
            if (existing && existing.id !== id)
                throw common_types_1.HttpError.conflict('E-mail já em uso');
            data.email = input.email.toLowerCase();
        }
        if (input.password)
            data.passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        if (input.isActive !== undefined)
            data.isActive = input.isActive;
        if (input.permissions !== undefined)
            data.permissions = input.permissions;
        if (input.role && input.role !== user.role) {
            if (id === requestingUserId)
                throw common_types_1.HttpError.conflict('Não é possível alterar o próprio papel');
            if (input.role === 'COLLABORATOR' && user.role === 'ADMIN') {
                const adminCount = await database_1.prisma.leadUser.count({ where: { workspaceId, role: 'ADMIN' } });
                if (adminCount <= 1)
                    throw common_types_1.HttpError.conflict('Não é possível rebaixar o único administrador');
            }
            data.role = input.role;
        }
        return database_1.prisma.leadUser.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true, createdAt: true },
        });
    }
    async deleteUser(id, workspaceId) {
        const user = await database_1.prisma.leadUser.findFirst({ where: { id, workspaceId } });
        if (!user)
            throw common_types_1.HttpError.notFound('Usuário não encontrado');
        if (user.role === 'ADMIN')
            throw common_types_1.HttpError.conflict('Não é possível excluir o admin');
        await database_1.prisma.lead.updateMany({ where: { assignedToId: id, workspaceId }, data: { assignedToId: null } });
        await database_1.prisma.leadUser.delete({ where: { id } });
    }
    // ─── Profile ───────────────────────────────────────────────────────────────
    async getMe(id) {
        const user = await database_1.prisma.leadUser.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, role: true, avatar: true, permissions: true, workspace: { select: { name: true, slug: true } } },
        });
        if (!user)
            throw common_types_1.HttpError.notFound('Usuário não encontrado');
        const { workspace, ...rest } = user;
        return { ...rest, workspaceName: workspace?.name ?? null, workspaceSlug: workspace?.slug ?? null };
    }
    async updateProfile(id, input) {
        const data = {};
        if (input.name)
            data.name = input.name;
        if (input.password)
            data.passwordHash = await bcryptjs_1.default.hash(input.password, env_1.env.BCRYPT_ROUNDS);
        if (input.avatar !== undefined)
            data.avatar = input.avatar; // null removes avatar
        return database_1.prisma.leadUser.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, avatar: true },
        });
    }
    // ─── Leads ─────────────────────────────────────────────────────────────────
    async list(userId, role, workspaceId, permissions = DEFAULT_PERMS, since, search, withMessages = false) {
        const baseWhere = (role === 'ADMIN' || permissions.viewAllLeads)
            ? { workspaceId }
            : { workspaceId, assignedToId: userId };
        // Search mode: busca por nome/telefone nas conversas (leads com mensagens)
        if (search) {
            const leads = await database_1.prisma.lead.findMany({
                where: {
                    ...baseWhere,
                    lastMessageAt: { not: null },
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search } },
                    ],
                },
                orderBy: { lastMessageAt: 'desc' },
                take: 60,
                select: {
                    id: true, name: true, phone: true, status: true, tags: true,
                    unreadCount: true, lastMessageAt: true, origin: true, stageId: true,
                    assignedToId: true, contactId: true, createdAt: true, isBlocked: true, avatarUrl: true,
                    assignedTo: { select: { id: true, name: true } },
                    stage: { select: { id: true, name: true, color: true } },
                },
            });
            return leads.map(l => ({ ...l, lastMessagePreview: null, lastMessageOut: null }));
        }
        // Delta: filtra apenas leads alterados desde `since` — sem query de mensagens
        if (since) {
            const leads = await database_1.prisma.lead.findMany({
                where: {
                    ...baseWhere,
                    OR: [
                        { updatedAt: { gt: since } },
                        { lastMessageAt: { gt: since } },
                    ],
                },
                orderBy: [{ stageMovedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
                select: {
                    id: true, name: true, phone: true, status: true, tags: true,
                    unreadCount: true, lastMessageAt: true, origin: true, stageId: true,
                    assignedToId: true, contactId: true, createdAt: true, isBlocked: true, avatarUrl: true,
                    assignedTo: { select: { id: true, name: true } },
                    stage: { select: { id: true, name: true, color: true } },
                },
            });
            return leads.map(l => ({ ...l, lastMessagePreview: null, lastMessageOut: null }));
        }
        // Full load: retorna todos + preview da última mensagem
        const leads = await database_1.prisma.lead.findMany({
            where: baseWhere,
            orderBy: [{ stageMovedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
            select: {
                id: true, name: true, phone: true, status: true, tags: true,
                unreadCount: true, lastMessageAt: true, origin: true, stageId: true,
                assignedToId: true, contactId: true, createdAt: true, isBlocked: true, avatarUrl: true,
                assignedTo: { select: { id: true, name: true } },
                stage: { select: { id: true, name: true, color: true } },
            },
        });
        // Optim: só busca previews se cliente pediu via ?withMessages=1.
        // Sem flag (default /leads/): preview=null. Economiza ~25 MB em
        // workspaces com 10k+ leads.
        if (!withMessages) {
            return leads.map(l => ({ ...l, lastMessagePreview: null, lastMessageOut: null }));
        }
        const contactIds = leads.map(l => l.contactId).filter(Boolean);
        if (contactIds.length === 0)
            return leads.map(l => ({ ...l, lastMessagePreview: null, lastMessageOut: null }));
        const lastMessages = await database_1.prisma.$queryRaw `
      SELECT DISTINCT ON (contact_id)
        contact_id, message_content, direction, sent_at
      FROM messages
      WHERE contact_id = ANY(${contactIds}::uuid[])
        AND message_content IS NOT NULL
      ORDER BY contact_id, sent_at DESC NULLS LAST
    `;
        const previewMap = new Map(lastMessages.map(m => [m.contact_id, m]));
        return leads.map(l => {
            const preview = l.contactId ? previewMap.get(l.contactId) : undefined;
            return {
                ...l,
                lastMessagePreview: preview?.message_content ?? null,
                lastMessageOut: preview ? preview.direction === 'OUTBOUND' : null,
            };
        });
    }
    async create(input, workspaceId, creatorId, creatorRole) {
        const phone = input.phone.replace(/\D/g, '');
        const blocked = await database_1.prisma.blockedPhone.findFirst({ where: { phone, workspaceId } });
        if (blocked)
            throw common_types_1.HttpError.conflict('Este número está bloqueado e não pode ser adicionado', 'PHONE_BLOCKED');
        // Dedup: reject if a lead already exists for this canonical phone (handles 9th digit variants)
        const canonicalPhone = canonicalBrazilianPhone(input.phone);
        const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(canonicalPhone);
        const existingLead = await database_1.prisma.lead.findFirst({
            where: { workspaceId, phone: { in: phoneVariants } },
        });
        if (existingLead)
            throw common_types_1.HttpError.conflict('Já existe um lead com este número', 'DUPLICATE_LEAD');
        // Auto-assign to creator when collaborator creates a lead without explicit assignee
        const assignedToId = input.assignedToId ?? (creatorRole !== 'ADMIN' && creatorId ? creatorId : null);
        const contactId = await this.findOrCreateContact(input.phone, input.name);
        return database_1.prisma.lead.create({
            data: {
                name: input.name,
                phone: input.phone,
                origin: input.origin,
                notes: input.notes,
                assignedToId,
                contactId,
                workspaceId,
            },
            include: { assignedTo: { select: { id: true, name: true } } },
        });
    }
    async findOrCreateContact(phone, name) {
        try {
            const phoneNormalized = canonicalBrazilianPhone(phone);
            if (!phoneNormalized)
                return null;
            // Try to find by any phone variant (handles 9th digit mismatch)
            const variants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
            const existing = await database_1.prisma.contact.findFirst({
                where: { phoneNormalized: { in: variants } },
                select: { id: true, lead: { select: { id: true } } },
            });
            if (existing) {
                if (!existing.lead)
                    return existing.id;
                return null;
            }
            const contact = await database_1.prisma.contact.create({
                data: { name, phone, phoneNormalized, optIn: true, optInSource: 'lead_import' },
                select: { id: true },
            });
            return contact.id;
        }
        catch {
            return null;
        }
    }
    async update(id, input, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId } });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && !permissions.manageLeads && lead.assignedToId !== userId) {
            throw common_types_1.HttpError.forbidden('Sem permissão para editar este lead');
        }
        const data = { ...input };
        if (input.status === 'pego' && !lead.pegadoAt) {
            data.pegadoAt = new Date();
        }
        if (input.stageId !== undefined && input.stageId !== lead.stageId) {
            data.stageMovedAt = new Date();
        }
        const updated = await database_1.prisma.lead.update({
            where: { id },
            data,
            include: { assignedTo: { select: { id: true, name: true } } },
        });
        // Registra evento de atribuição no histórico do lead
        if (input.assignedToId !== undefined && input.assignedToId !== lead.assignedToId) {
            const actor = await database_1.prisma.leadUser.findUnique({ where: { id: userId }, select: { name: true } });
            if (input.assignedToId) {
                const newUser = await database_1.prisma.leadUser.findUnique({ where: { id: input.assignedToId }, select: { name: true } });
                await database_1.prisma.$executeRaw `INSERT INTO lead_events (lead_id, actor_id, actor_name, type, payload)
          VALUES (${id}::uuid, ${userId}::uuid, ${actor?.name ?? null}, 'ASSIGNED',
          ${JSON.stringify({ toId: input.assignedToId, toName: newUser?.name ?? null, fromId: lead.assignedToId, fromName: null })}::jsonb)`;
            }
            else {
                await database_1.prisma.$executeRaw `INSERT INTO lead_events (lead_id, actor_id, actor_name, type, payload)
          VALUES (${id}::uuid, ${userId}::uuid, ${actor?.name ?? null}, 'UNASSIGNED',
          ${JSON.stringify({ fromId: lead.assignedToId })}::jsonb)`;
            }
        }
        // Fire LEAD_ASSIGNED rule if assignedToId was just set
        if (input.assignedToId && input.assignedToId !== lead.assignedToId) {
            kanban_service_1.KanbanService.applyEventRules(workspaceId, id, updated.stageId, 'LEAD_ASSIGNED').catch((err) => logger_1.logger.warn({ err, leadId: id }, 'LEAD_ASSIGNED rule error'));
        }
        // Fire AUTO_ASSIGN rules if lead has no vendor and stage changed
        if (!updated.assignedToId && input.stageId !== undefined && input.stageId !== lead.stageId) {
            kanban_service_1.KanbanService.applyAutoAssignRules(workspaceId, id, updated.stageId).catch((err) => logger_1.logger.warn({ err, leadId: id }, 'AUTO_ASSIGN rule error'));
        }
        return updated;
    }
    async report(from, to, workspaceId) {
        const toEOD = new Date(to);
        toEOD.setHours(23, 59, 59, 999);
        const [allLeads, users] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    status: true,
                    assignedToId: true,
                    pegadoAt: true,
                    createdAt: true,
                    assignedTo: { select: { id: true, name: true } },
                },
            }),
            database_1.prisma.leadUser.findMany({
                where: { workspaceId, role: 'COLLABORATOR' },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
        ]);
        const pickedInPeriod = allLeads.filter((l) => l.pegadoAt && l.pegadoAt >= from && l.pegadoAt <= toEOD);
        const byVendedor = {};
        for (const l of pickedInPeriod) {
            const key = l.assignedTo?.name || '(sem nome)';
            if (!byVendedor[key])
                byVendedor[key] = { name: key, pego: 0, em_andamento: 0, perdido: 0, disponivel: 0 };
            const stat = l.status;
            if (stat !== 'name')
                byVendedor[key][stat]++;
        }
        const portfolio = users.map((u) => {
            const assigned = allLeads.filter((l) => l.assignedToId === u.id);
            return {
                id: u.id,
                name: u.name,
                total: assigned.length,
                disponivel: assigned.filter((l) => l.status === 'disponivel').length,
                pego: assigned.filter((l) => l.status === 'pego').length,
                em_andamento: assigned.filter((l) => l.status === 'em_andamento').length,
                perdido: assigned.filter((l) => l.status === 'perdido').length,
            };
        });
        return {
            period: { from: from.toISOString(), to: toEOD.toISOString() },
            activity: Object.values(byVendedor).sort((a, b) => b.pego - a.pego),
            portfolio,
        };
    }
    async delete(id, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({ where: { id, workspaceId } });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        await database_1.prisma.lead.delete({ where: { id } });
    }
    async blockLead(id, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id, workspaceId },
            select: { id: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        const phone = lead.phone.replace(/\D/g, '');
        await Promise.all([
            database_1.prisma.lead.update({
                where: { id },
                data: { isBlocked: true, blockedAt: new Date() },
            }),
            database_1.prisma.blockedPhone.upsert({
                where: { phone },
                create: { phone, workspaceId },
                update: { blockedAt: new Date() },
            }),
        ]);
        return { blocked: true };
    }
    async unblockLead(id, workspaceId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id, workspaceId },
            select: { id: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        const phone = lead.phone.replace(/\D/g, '');
        await Promise.all([
            database_1.prisma.lead.update({ where: { id }, data: { isBlocked: false, blockedAt: null } }),
            database_1.prisma.blockedPhone.deleteMany({ where: { phone, workspaceId } }),
        ]);
        return { blocked: false };
    }
    async deleteConversation(leadId, workspaceId, deleteLead = false, blacklist = false) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, contactId: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        let deleted = 0;
        if (lead.contactId) {
            const result = await database_1.prisma.message.deleteMany({ where: { contactId: lead.contactId } });
            deleted = result.count;
        }
        if (blacklist && lead.phone) {
            const variants = (0, phone_normalizer_1.brazilianPhoneVariants)(lead.phone.replace(/\D/g, ''));
            await Promise.all(variants.map(phone => database_1.prisma.blockedPhone.upsert({
                where: { phone },
                create: { phone, workspaceId },
                update: { blockedAt: new Date() },
            })));
        }
        if (deleteLead) {
            await database_1.prisma.lead.delete({ where: { id: leadId } });
        }
        return { deleted };
    }
    async isPhoneBlocked(phone, workspaceId) {
        const normalized = phone.replace(/\D/g, '');
        const blocked = await database_1.prisma.blockedPhone.findFirst({
            where: { phone: normalized, workspaceId },
        });
        return !!blocked;
    }
    async bulkAssign(leadIds, assignedToId, workspaceId) {
        const result = await database_1.prisma.lead.updateMany({
            where: { id: { in: leadIds }, workspaceId },
            data: { assignedToId },
        });
        return { updated: result.count };
    }
    async redistribute(scope, userIds, workspaceId, leadIds, limit) {
        if (userIds.length === 0)
            throw common_types_1.HttpError.badRequest('Selecione ao menos um colaborador');
        let leads;
        if (scope === 'filtered' && leadIds && leadIds.length > 0) {
            leads = await database_1.prisma.lead.findMany({
                where: { id: { in: leadIds }, workspaceId },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
            });
        }
        else {
            const where = scope === 'unassigned'
                ? { workspaceId, assignedToId: null }
                : { workspaceId };
            leads = await database_1.prisma.lead.findMany({ where, select: { id: true }, orderBy: { createdAt: 'asc' } });
        }
        if (leads.length === 0)
            return { distributed: 0, perUser: {} };
        // Aplica o limite se informado
        if (limit && limit > 0 && limit < leads.length) {
            leads = leads.slice(0, limit);
        }
        const perUser = {};
        const updates = [];
        leads.forEach((lead, i) => {
            const userId = userIds[i % userIds.length];
            updates.push({ id: lead.id, assignedToId: userId });
            perUser[userId] = (perUser[userId] ?? 0) + 1;
        });
        await database_1.prisma.$transaction(updates.map((u) => database_1.prisma.lead.update({ where: { id: u.id }, data: { assignedToId: u.assignedToId } })));
        return { distributed: leads.length, perUser };
    }
    async bulkImport(input, workspaceId) {
        const [existing, blockedList] = await Promise.all([
            database_1.prisma.lead.findMany({ where: { workspaceId }, select: { phone: true } }),
            database_1.prisma.blockedPhone.findMany({ where: { workspaceId }, select: { phone: true } }),
        ]);
        const existingPhones = new Set(existing.map((l) => canonicalBrazilianPhone(l.phone)));
        const blockedPhones = new Set(blockedList.map((b) => b.phone));
        const toInsert = [];
        for (const item of input.items) {
            const digits = canonicalBrazilianPhone(item.phone);
            if (!digits || existingPhones.has(digits) || blockedPhones.has(digits))
                continue;
            existingPhones.add(digits);
            toInsert.push({
                name: item.name,
                phone: item.phone,
                origin: item.origin,
                notes: item.notes,
                assignedToId: input.assignedToId ?? null,
                workspaceId,
            });
        }
        // Create contacts and insert leads in chunks to avoid timeouts
        const CHUNK = 100;
        let imported = 0;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
            const chunk = toInsert.slice(i, i + CHUNK);
            // Create contacts in parallel for this chunk
            const contactIds = await Promise.all(chunk.map(item => this.findOrCreateContact(item.phone, item.name)));
            const leadsData = chunk.map((item, j) => ({ ...item, contactId: contactIds[j] ?? undefined }));
            await database_1.prisma.lead.createMany({ data: leadsData, skipDuplicates: true });
            imported += chunk.length;
        }
        return { imported, skipped: input.items.length - toInsert.length };
    }
    async getConversation(leadId, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            return { messages: [], hasContact: false };
        // Scope messages to connections belonging to this workspace only.
        // Contacts are global — the same phone can exist as leads in multiple workspaces,
        // so without this filter both workspaces would see each other's messages.
        const [waConns, tgConns] = await Promise.all([
            database_1.prisma.whatsappConnection.findMany({ where: { workspaceId }, select: { id: true } }),
            database_1.prisma.telegramConnection.findMany({ where: { workspaceId }, select: { id: true } }),
        ]);
        const waIds = waConns.map(c => c.id);
        const tgIds = tgConns.map(c => c.id);
        // Inclui também mensagens com workspaceId direto — preserva histórico mesmo após
        // conexão original ser deletada (FK ON DELETE SET NULL deixa connectionId NULL).
        const connFilter = [
            ...(waIds.length ? [{ connectionId: { in: waIds } }] : []),
            ...(tgIds.length ? [{ telegramConnectionId: { in: tgIds } }] : []),
            { workspaceId },
        ];
        const [messages, eventsRaw] = await Promise.all([
            database_1.prisma.message.findMany({
                where: {
                    contactId: lead.contactId,
                    ...(connFilter.length ? { OR: connFilter } : {}),
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    direction: true,
                    status: true,
                    messageContent: true,
                    metaResponse: true,
                    channel: true,
                    telegramConnectionId: true,
                    errorCode: true,
                    errorMessage: true,
                    sentAt: true,
                    createdAt: true,
                    connectionId: true,
                    connection: { select: { id: true, name: true } },
                },
            }),
            database_1.prisma.$queryRaw `
        SELECT id, actor_name, type, payload, created_at FROM lead_events
        WHERE lead_id = ${leadId}::uuid ORDER BY created_at ASC
      `,
        ]);
        const events = eventsRaw.map(e => ({
            id: e.id,
            actorName: e.actor_name,
            type: e.type,
            payload: e.payload,
            createdAt: e.created_at,
        }));
        return { messages, events, hasContact: true };
    }
    async aiAssist(leadId, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const { env } = await Promise.resolve().then(() => __importStar(require('../../config/env')));
        if (!env.ANTHROPIC_API_KEY)
            throw common_types_1.HttpError.badRequest('Chave da API de IA não configurada');
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, name: true, assignedToId: true, contactId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            throw common_types_1.HttpError.badRequest('Lead sem contato vinculado');
        const messages = await database_1.prisma.message.findMany({
            where: { contactId: lead.contactId },
            orderBy: { createdAt: 'asc' },
            take: 40,
            select: { direction: true, messageContent: true },
        });
        const transcript = messages
            .filter(m => m.messageContent)
            .map(m => `[${m.direction === 'INBOUND' ? 'Cliente' : 'Atendente'}]: ${m.messageContent}`)
            .join('\n');
        if (!transcript)
            throw common_types_1.HttpError.badRequest('Sem mensagens para analisar');
        const prompt = `Você é um assistente de CRM especializado em vendas. Analise a conversa abaixo com o lead "${lead.name}" e responda APENAS com um JSON válido no formato especificado.

CONVERSA:
${transcript}

Responda SOMENTE com este JSON (sem markdown, sem texto extra):
{
  "suggestedReply": "mensagem sugerida para enviar ao cliente agora (em português, tom profissional e natural, máximo 3 frases)",
  "classification": "quente|morno|frio",
  "intention": "investir|duvida|suporte|desinteressado",
  "nextStep": "próximo passo recomendado para fechar ou avançar o negócio (1 frase)"
}`;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 512,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw common_types_1.HttpError.badRequest(`Erro na API de IA: ${err}`);
        }
        const data = await res.json();
        const raw = (data?.content?.[0]?.text ?? '');
        // Remove markdown code fences if present
        const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        try {
            return JSON.parse(text);
        }
        catch {
            throw common_types_1.HttpError.badRequest(`Resposta inválida da IA: ${text.slice(0, 200)}`);
        }
    }
    async getTagOptions(workspaceId) {
        const [fromLeads, fromOptions] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId, tags: { isEmpty: false } },
                select: { tags: true },
            }),
            database_1.prisma.workspaceTagOption.findMany({
                where: { workspaceId },
                select: { tag: true },
            }),
        ]);
        const all = [
            ...fromLeads.flatMap((l) => l.tags),
            ...fromOptions.map((o) => o.tag),
        ];
        return [...new Set(all)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    async createTagOption(workspaceId, tag) {
        await database_1.prisma.workspaceTagOption.upsert({
            where: { workspaceId_tag: { workspaceId, tag } },
            create: { workspaceId, tag },
            update: {},
        });
        return { tag };
    }
    async deleteTagOption(workspaceId, tag) {
        await database_1.prisma.workspaceTagOption.deleteMany({ where: { workspaceId, tag } });
        const leadsWithTag = await database_1.prisma.lead.findMany({
            where: { workspaceId, tags: { has: tag } },
            select: { id: true, tags: true },
        });
        await Promise.all(leadsWithTag.map((l) => database_1.prisma.lead.update({
            where: { id: l.id },
            data: { tags: l.tags.filter((t) => t !== tag) },
        })));
        return { ok: true };
    }
    async markAsRead(leadId, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({ where: { id: leadId, workspaceId }, select: { id: true, assignedToId: true } });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        await database_1.prisma.lead.update({ where: { id: leadId }, data: { unreadCount: 0 } });
        return { ok: true };
    }
    async startConversation(leadId, connectionId, templateName, language, variables, userId, role, workspaceId, permissions = DEFAULT_PERMS) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true, phone: true, name: true, stageId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        const connection = await database_1.prisma.whatsappConnection.findFirst({
            where: { id: connectionId, status: 'ACTIVE' },
            select: { id: true, phoneNumberId: true, accessTokenEnc: true, metaQualityRating: true, rateLimitPerDay: true },
        });
        if (!connection)
            throw common_types_1.HttpError.badRequest('Conexão não encontrada ou inativa');
        if (connection.metaQualityRating === 'RED')
            throw common_types_1.HttpError.badRequest('Conexão com qualidade baixa (RED) na Meta — envio de templates bloqueado. Respostas a conversas existentes ainda funcionam.', 'QUALITY_RED');
        await checkAndIncrementTemplateDailyLimit(connection.id, connection.rateLimitPerDay ?? 0);
        // Ensure contact exists
        const phone = lead.phone.replace(/\D/g, '');
        // Meta exige número com DDI. Se não começar com código de país conhecido, adiciona 55 (Brasil)
        const phoneForMeta = phone.startsWith('55') || phone.startsWith('1') || phone.startsWith('44') || phone.startsWith('351')
            ? phone
            : `55${phone}`;
        // phoneNormalized sempre com DDI (formato E.164 sem +) para garantir match com webhook inbound
        const phoneNormalized = phoneForMeta;
        // Todas as variantes (com/sem DDI, com/sem 9º dígito) para evitar duplicatas
        const phoneVariants = (0, phone_normalizer_1.brazilianPhoneVariants)(phoneNormalized);
        let contact = lead.contactId
            ? await database_1.prisma.contact.findUnique({ where: { id: lead.contactId }, select: { id: true, phoneNormalized: true } })
            : await database_1.prisma.contact.findFirst({ where: { phoneNormalized: { in: phoneVariants } }, select: { id: true, phoneNormalized: true } });
        if (!contact) {
            try {
                contact = await database_1.prisma.contact.create({
                    data: { name: lead.name, phone, phoneNormalized, optIn: true, optInSource: 'manual' },
                    select: { id: true, phoneNormalized: true },
                });
            }
            catch {
                contact = await database_1.prisma.contact.findFirst({ where: { phoneNormalized: { in: phoneVariants } }, select: { id: true, phoneNormalized: true } });
                if (!contact)
                    throw common_types_1.HttpError.badRequest('Erro ao criar contato');
            }
        }
        if (!lead.contactId) {
            await database_1.prisma.lead.update({ where: { id: leadId }, data: { contactId: contact.id } });
        }
        // Fetch template body to build readable messageContent
        const templateRecord = await database_1.prisma.template.findFirst({
            where: { name: templateName, connectionId: connection.id },
            select: { body: true },
        });
        // Extract named placeholders ({{nome}}) vs positional ({{1}})
        const namedPlaceholders = (templateRecord?.body ?? '')
            .match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)?.map(m => m.slice(2, -2)) ?? [];
        const hasNamedParams = namedPlaceholders.length > 0;
        let resolvedContent = `[Template: ${templateName}]`;
        if (templateRecord?.body) {
            resolvedContent = templateRecord.body;
            variables.forEach((v, i) => {
                resolvedContent = resolvedContent.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
                if (namedPlaceholders[i]) {
                    resolvedContent = resolvedContent.replace(new RegExp(`\\{\\{${namedPlaceholders[i]}\\}\\}`, 'g'), v);
                }
            });
        }
        // Build template payload — named params require parameter_name field
        const components = [];
        if (variables.length > 0) {
            components.push({
                type: 'body',
                parameters: variables.map((v, i) => {
                    const param = { type: 'text', text: v };
                    if (hasNamedParams && namedPlaceholders[i])
                        param.parameter_name = namedPlaceholders[i];
                    return param;
                }),
            });
        }
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const cloudApi = new cloud_api_service_1.CloudApiService();
        const result = await cloudApi.sendTemplate(connection.phoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneForMeta,
            type: 'template',
            template: { name: templateName, language: { code: language }, components },
        });
        if (!result.success)
            throw common_types_1.HttpError.badRequest(result.error?.message || 'Falha ao enviar template');
        await incrementConnectionCounters(connection.id).catch(() => { });
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: contact.id,
                connectionId: connection.id,
                direction: 'OUTBOUND',
                status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent: resolvedContent,
                metaResponse: result.rawResponse,
                sentAt: new Date(),
            },
            select: {
                id: true, direction: true, status: true,
                messageContent: true, errorCode: true, errorMessage: true,
                sentAt: true, createdAt: true,
                connectionId: true, connection: { select: { id: true, name: true } },
            },
        });
        await database_1.prisma.lead.update({
            where: { id: leadId },
            data: { lastMessageAt: new Date() },
        });
        // Aplica regras do tipo TEMPLATE_SENT e FIRST_MESSAGE do pipeline
        await kanban_service_1.KanbanService.applyEventRules(workspaceId, leadId, lead.stageId, 'TEMPLATE_SENT').catch(() => { });
        await kanban_service_1.KanbanService.applyEventRules(workspaceId, leadId, lead.stageId, 'FIRST_MESSAGE').catch(() => { });
        // Busca o stageId atualizado para retornar ao frontend
        const updated = await database_1.prisma.lead.findUnique({ where: { id: leadId }, select: { stageId: true } });
        return { ...msg, newStageId: updated?.stageId ?? null };
    }
    async sendReply(leadId, text, userId, role, workspaceId, permissions = DEFAULT_PERMS, preferredConnectionId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true, phone: true, firstMessageId: true, stageId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            throw common_types_1.HttpError.badRequest('Lead sem contato vinculado');
        const contact = await database_1.prisma.contact.findUnique({
            where: { id: lead.contactId },
            select: { phone: true, phoneNormalized: true, telegramChatId: true },
        });
        if (!contact)
            throw common_types_1.HttpError.badRequest('Contato não encontrado');
        const lastMessage = await database_1.prisma.message.findFirst({
            where: { contactId: lead.contactId, direction: 'INBOUND' },
            orderBy: { sentAt: 'desc' },
            select: { connectionId: true, telegramConnectionId: true, channel: true },
        });
        // ── Roteamento Telegram ────────────────────────────────────────────────
        const isTelegramLead = contact.telegramChatId && lastMessage?.channel === 'TELEGRAM';
        if (isTelegramLead && lastMessage?.telegramConnectionId) {
            const { TelegramService } = await Promise.resolve().then(() => __importStar(require('../../modules/telegram/telegram.service')));
            const { telegramApiService } = await Promise.resolve().then(() => __importStar(require('../../services/telegram/telegram-api.service')));
            const tgService = new TelegramService();
            const token = await tgService.getDecryptedToken(lastMessage.telegramConnectionId);
            const result = await telegramApiService.sendMessage(token, contact.telegramChatId, text);
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId,
                    telegramConnectionId: lastMessage.telegramConnectionId,
                    channel: 'TELEGRAM',
                    direction: 'OUTBOUND',
                    status: result.ok ? client_1.MessageStatus.SENT : client_1.MessageStatus.FAILED,
                    telegramMessageId: result.message_id ? `tg_out_${result.message_id}_${contact.telegramChatId}` : `tg_out_fail_${Date.now()}`,
                    messageContent: text,
                    sentAt: new Date(),
                    ...(result.ok ? {} : { failedAt: new Date(), errorMessage: result.error }),
                },
                select: {
                    id: true, direction: true, status: true,
                    messageContent: true, errorCode: true, errorMessage: true,
                    sentAt: true, createdAt: true,
                    telegramConnectionId: true, channel: true,
                },
            });
            if (result.ok) {
                const now = new Date();
                const leadPatch = { lastMessageAt: now, messageCount: { increment: 1 } };
                if (!lead.firstMessageId) {
                    leadPatch.firstMessageId = msg.id;
                    leadPatch.firstMessageSentAt = now;
                }
                await database_1.prisma.lead.update({ where: { id: lead.id }, data: leadPatch });
            }
            return msg;
        }
        // ── WhatsApp Web não-oficial via uazapi (terceiro) ────────────────────
        if (preferredConnectionId) {
            const uazapiRows = await database_1.prisma.$queryRawUnsafe(
                `SELECT id, uazapi_id AS "uazapiId", uazapi_token AS "uazapiToken",
                        antiban_enabled AS "antibanEnabled", paired_at AS "pairedAt"
                 FROM uazapi_instances
                 WHERE id = $1::uuid AND workspace_id = $2::uuid AND deleted_at IS NULL LIMIT 1`,
                preferredConnectionId, workspaceId
            );
            const uazapiInst = uazapiRows?.[0];
            if (uazapiInst) {
                const phone = contact.phoneNormalized ?? '';
                const { uazapiClient } = require('../../services/uazapi/uazapi.client');
                const humanizedText = (() => {
                    if (!uazapiInst.antibanEnabled) return text;
                    if (!text || text.length < 8) return text;
                    const zwsp = '​';
                    const insertAt = 1 + Math.floor(Math.random() * (text.length - 2));
                    return text.slice(0, insertAt) + zwsp + text.slice(insertAt);
                })();
                let uazError = null;
                let realWamid = null;
                try {
                    const result = await uazapiClient.sendText(uazapiInst.uazapiToken, {
                        number: phone,
                        text: humanizedText,
                    });
                    realWamid = result?.messageid || result?.id || null;
                } catch (e) {
                    uazError = e?.message || 'Falha de envio uazapi';
                }
                const status = uazError ? 'FAILED' : 'SENT';
                const wamid = realWamid || `uazapi_${Date.now()}`;
                const rows = await database_1.prisma.$queryRawUnsafe(`
                    INSERT INTO messages (
                        id, contact_id, uazapi_instance_id, channel, direction, status,
                        wamid, message_content, sent_at,
                        failed_at, error_message, created_at, updated_at, workspace_id
                    ) VALUES (
                        gen_random_uuid(), $1::uuid, $2, 'WHATSAPP', 'OUTBOUND', $3::"MessageStatus",
                        $4, $5, now(),
                        $6, $7, now(), now(), $8::uuid
                    )
                    RETURNING id, direction, status, message_content AS "messageContent",
                              error_code AS "errorCode", error_message AS "errorMessage",
                              sent_at AS "sentAt", created_at AS "createdAt",
                              uazapi_instance_id AS "uazapiInstanceId", channel, wamid
                `, lead.contactId, uazapiInst.uazapiId, status,
                wamid, text,
                uazError ? new Date() : null, uazError, workspaceId);
                const msg = rows[0];
                if (!uazError) {
                    await database_1.prisma.lead.update({
                        where: { id: leadId }, data: { lastMessageAt: new Date() },
                    });
                }
                return msg;
            }
        }
        // ── WhatsApp ──────────────────────────────────────────────────────────
        // Prioridade: 1) conexão escolhida pelo operador, 2) conexão da última mensagem INBOUND, 3) qualquer ativa do workspace
        const preferredId = preferredConnectionId || lastMessage?.connectionId || null;
        let connection = preferredId
            ? await database_1.prisma.whatsappConnection.findFirst({
                where: { id: preferredId, status: 'ACTIVE' },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true, rateLimitPerDay: true },
            })
            : null;
        // Fallback: qualquer conexão ativa do workspace
        if (!connection) {
            connection = await database_1.prisma.whatsappConnection.findFirst({
                where: { status: 'ACTIVE', OR: [{ workspaceId }, { workspaceId: null }] },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true, rateLimitPerDay: true },
            });
        }
        if (!connection)
            throw common_types_1.HttpError.badRequest('Nenhuma conexão ativa disponível');
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const rawPhone = contact.phoneNormalized ?? '';
        const to = rawPhone.length === 11 && !rawPhone.startsWith('55') ? `55${rawPhone}` : rawPhone;
        const cloudApi = new cloud_api_service_1.CloudApiService();
        const result = await cloudApi.sendText(connection.phoneNumberId, accessToken, to, text);
        // Se a Meta rejeitou: salva como FAILED para exibir o erro real no chat
        if (!result.success) {
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId,
                    connectionId: connection.id,
                    direction: 'OUTBOUND',
                    status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`,
                    messageContent: text,
                    metaResponse: (result.rawResponse ?? {}),
                    sentAt: new Date(),
                    failedAt: new Date(),
                    errorCode: result.error?.code ? String(result.error.code) : null,
                    errorMessage: result.error?.message ?? 'Falha ao enviar mensagem',
                },
                select: {
                    id: true, direction: true, status: true,
                    messageContent: true, errorCode: true, errorMessage: true,
                    sentAt: true, createdAt: true,
                    connectionId: true, connection: { select: { id: true, name: true } },
                },
            });
            return msg;
        }
        // Respostas de texto livre (janela 24h) não contabilizam no contador — só templates
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: lead.contactId,
                connectionId: connection.id,
                direction: 'OUTBOUND',
                status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent: text,
                metaResponse: result.rawResponse,
                sentAt: new Date(),
            },
            select: {
                id: true, direction: true, status: true,
                messageContent: true, errorCode: true, errorMessage: true,
                sentAt: true, createdAt: true,
                connectionId: true, connection: { select: { id: true, name: true } },
            },
        });
        const now = new Date();
        const isFirst = !lead.firstMessageId;
        const leadPatch = { lastMessageAt: now, messageCount: { increment: 1 } };
        if (isFirst) {
            leadPatch.firstMessageId = msg.id;
            leadPatch.firstMessageSentAt = now;
        }
        await database_1.prisma.lead.update({ where: { id: leadId }, data: leadPatch });
        // Dispara regra FIRST_MESSAGE do kanban na primeira mensagem
        if (isFirst) {
            kanban_service_1.KanbanService.applyEventRules(workspaceId, leadId, lead.stageId, 'FIRST_MESSAGE').catch(() => { });
        }
        return msg;
    }
    async shareContact(leadId, contactName, contactPhone, userId, role, workspaceId, permissions = DEFAULT_PERMS, preferredConnectionId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true, phone: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            throw common_types_1.HttpError.badRequest('Lead sem contato vinculado');
        const contact = await database_1.prisma.contact.findUnique({
            where: { id: lead.contactId },
            select: { phoneNormalized: true },
        });
        if (!contact)
            throw common_types_1.HttpError.badRequest('Contato não encontrado');
        const lastMessage = await database_1.prisma.message.findFirst({
            where: { contactId: lead.contactId, direction: 'INBOUND' },
            orderBy: { sentAt: 'desc' },
            select: { connectionId: true },
        });
        const preferredId = preferredConnectionId || lastMessage?.connectionId || null;
        let connection = preferredId
            ? await database_1.prisma.whatsappConnection.findFirst({
                where: { id: preferredId, status: 'ACTIVE' },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true },
            })
            : null;
        if (!connection) {
            connection = await database_1.prisma.whatsappConnection.findFirst({
                where: { status: 'ACTIVE', OR: [{ workspaceId }, { workspaceId: null }] },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true },
            });
        }
        if (!connection)
            throw common_types_1.HttpError.badRequest('Nenhuma conexão ativa disponível');
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const rawPhone = contact.phoneNormalized ?? '';
        const to = rawPhone.length === 11 && !rawPhone.startsWith('55') ? `55${rawPhone}` : rawPhone;
        const cloudApi = new cloud_api_service_1.CloudApiService();
        const result = await cloudApi.sendContact(connection.phoneNumberId, accessToken, to, {
            name: contactName,
            phone: contactPhone,
        });
        const messageContent = `👤 ${contactName} · ${contactPhone}`;
        if (!result.success) {
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId,
                    connectionId: connection.id,
                    direction: 'OUTBOUND',
                    status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`,
                    messageContent,
                    metaResponse: (result.rawResponse ?? {}),
                    sentAt: new Date(),
                    failedAt: new Date(),
                    errorCode: result.error?.code ? String(result.error.code) : null,
                    errorMessage: result.error?.message ?? 'Falha ao enviar contato',
                },
                select: {
                    id: true, direction: true, status: true,
                    messageContent: true, errorCode: true, errorMessage: true,
                    sentAt: true, createdAt: true,
                    connectionId: true, connection: { select: { id: true, name: true } },
                },
            });
            return msg;
        }
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: lead.contactId,
                connectionId: connection.id,
                direction: 'OUTBOUND',
                status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent,
                metaResponse: result.rawResponse,
                sentAt: new Date(),
            },
            select: {
                id: true, direction: true, status: true,
                messageContent: true, errorCode: true, errorMessage: true,
                sentAt: true, createdAt: true,
                connectionId: true, connection: { select: { id: true, name: true } },
            },
        });
        await database_1.prisma.lead.update({
            where: { id: leadId },
            data: { lastMessageAt: new Date() },
        });
        return msg;
    }
    async transcodeToOgg(inputBuffer, inputExt) {
        const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { tmpdir } = await Promise.resolve().then(() => __importStar(require('os')));
        const { writeFile, readFile, unlink } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const inPath = `${tmpdir()}/${id}.${inputExt}`;
        const wavPath = `${tmpdir()}/${id}.wav`;
        const outPath = `${tmpdir()}/${id}.ogg`;
        await writeFile(inPath, inputBuffer);
        try {
            // Step 1: decode to WAV/PCM (universal intermediate)
            await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', inPath, '-vn', '-ac', '1', '-ar', '48000', '-f', 'wav', wavPath], (err, _stdout, stderr) => err ? (logger_1.logger.warn({ err, stderr }, 'ffmpeg decode failed'), reject(err)) : resolve()));
            // Step 2: encode to OGG/Opus via ffmpeg libopus
            await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000', outPath], (err, _stdout, stderr) => err ? (logger_1.logger.warn({ err, stderr }, 'ffmpeg libopus encode failed'), reject(err)) : resolve()));
            const out = await readFile(outPath);
            logger_1.logger.info({ inBytes: inputBuffer.length, outBytes: out.length, inputExt }, 'Audio transcoded to ogg/opus via opusenc');
            return await addWhatsAppWaveform(out);
        }
        finally {
            await unlink(inPath).catch(() => { });
            await unlink(wavPath).catch(() => { });
            await unlink(outPath).catch(() => { });
        }
    }
    async sendAudioReply(leadId, audioBuffer, mimeType, userId, role, workspaceId, permissions = DEFAULT_PERMS, preferredConnectionId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            throw common_types_1.HttpError.badRequest('Lead sem contato vinculado');
        const contact = await database_1.prisma.contact.findUnique({
            where: { id: lead.contactId },
            select: { phoneNormalized: true },
        });
        if (!contact)
            throw common_types_1.HttpError.badRequest('Contato não encontrado');
        const lastInbound = await database_1.prisma.message.findFirst({
            where: { contactId: lead.contactId, direction: 'INBOUND' },
            orderBy: { sentAt: 'desc' },
            select: { connectionId: true },
        });
        const preferredId = preferredConnectionId || lastInbound?.connectionId || null;
        let connection = preferredId
            ? await database_1.prisma.whatsappConnection.findFirst({
                where: { id: preferredId, status: 'ACTIVE' },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true, rateLimitPerDay: true },
            })
            : null;
        if (!connection) {
            connection = await database_1.prisma.whatsappConnection.findFirst({
                where: { status: 'ACTIVE', OR: [{ workspaceId }, { workspaceId: null }] },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true, rateLimitPerDay: true },
            });
        }
        if (!connection)
            throw common_types_1.HttpError.badRequest('Nenhuma conexão ativa disponível');
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const rawPhone2 = contact.phoneNormalized ?? '';
        const to = rawPhone2.length === 11 && !rawPhone2.startsWith('55') ? `55${rawPhone2}` : rawPhone2;
        // Transcodar para OGG/Opus no formato RecorderJS (idêntico ao Kommo)
        // A Meta preserva arquivos RecorderJS sem recodificar → waveform renderiza no WhatsApp
        let uploadBuffer = audioBuffer;
        const inputExt = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : 'mp4';
        try {
            uploadBuffer = await repackAsRecorderJS(await this.transcodeToOgg(audioBuffer, inputExt));
        }
        catch (transcodeErr) {
            logger_1.logger.warn({ err: transcodeErr, mimeType }, 'repackAsRecorderJS failed, using raw buffer');
        }
        const cloudApi = new cloud_api_service_1.CloudApiService();
        const filename = `audio_${Date.now()}.ogg`;
        let mediaId;
        try {
            mediaId = await cloudApi.uploadMedia(connection.phoneNumberId, accessToken, uploadBuffer, 'audio/ogg', filename);
            logger_1.logger.info({ mediaId, bytes: uploadBuffer.length }, 'Audio uploaded to Meta');
        }
        catch (uploadErr) {
            const errMsg = uploadErr instanceof Error ? uploadErr.message : 'Falha no upload de mídia';
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId, connectionId: connection.id,
                    direction: 'OUTBOUND', status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`, messageContent: '🎧 Áudio',
                    metaResponse: {}, sentAt: new Date(), failedAt: new Date(), errorMessage: errMsg,
                },
                select: { id: true, direction: true, status: true, messageContent: true, errorCode: true, errorMessage: true, sentAt: true, createdAt: true, connectionId: true, connection: { select: { id: true, name: true } } },
            });
            return msg;
        }
        logger_1.logger.info({ mediaId, to }, 'Sending audio via media_id');
        const result = await cloudApi.sendAudio(connection.phoneNumberId, accessToken, to, mediaId);
        logger_1.logger.info({ success: result.success, wamid: result.wamid, error: result.error }, 'Meta sendAudio result');
        if (!result.success) {
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId,
                    connectionId: connection.id,
                    direction: 'OUTBOUND',
                    status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`,
                    messageContent: '🎧 Áudio',
                    metaResponse: (result.rawResponse ?? {}),
                    sentAt: new Date(),
                    failedAt: new Date(),
                    errorCode: result.error?.code ? String(result.error.code) : null,
                    errorMessage: result.error?.message ?? 'Falha ao enviar áudio',
                },
                select: {
                    id: true, direction: true, status: true,
                    messageContent: true, errorCode: true, errorMessage: true,
                    sentAt: true, createdAt: true,
                    connectionId: true, connection: { select: { id: true, name: true } },
                },
            });
            return msg;
        }
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: lead.contactId,
                connectionId: connection.id,
                direction: 'OUTBOUND',
                status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent: null,
                metaResponse: { type: 'audio', audio: { id: mediaId } },
                sentAt: new Date(),
            },
            select: {
                id: true, direction: true, status: true,
                messageContent: true, errorCode: true, errorMessage: true,
                sentAt: true, createdAt: true,
                connectionId: true, connection: { select: { id: true, name: true } },
                metaResponse: true,
            },
        });
        await database_1.prisma.lead.update({
            where: { id: leadId },
            data: { lastMessageAt: new Date() },
        });
        return msg;
    }
    async sendImageReply(leadId, imageBuffer, mimeType, caption, userId, role, workspaceId, permissions = DEFAULT_PERMS, preferredConnectionId) {
        const lead = await database_1.prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, assignedToId: true, contactId: true },
        });
        if (!lead)
            throw common_types_1.HttpError.notFound('Lead não encontrado');
        if (role !== 'ADMIN' && !permissions.viewAllLeads && lead.assignedToId !== userId)
            throw common_types_1.HttpError.forbidden('Sem permissão');
        if (!lead.contactId)
            throw common_types_1.HttpError.badRequest('Lead sem contato vinculado');
        const contact = await database_1.prisma.contact.findUnique({
            where: { id: lead.contactId },
            select: { phoneNormalized: true },
        });
        if (!contact)
            throw common_types_1.HttpError.badRequest('Contato não encontrado');
        const lastInbound = await database_1.prisma.message.findFirst({
            where: { contactId: lead.contactId, direction: 'INBOUND' },
            orderBy: { sentAt: 'desc' },
            select: { connectionId: true },
        });
        const preferredId = preferredConnectionId || lastInbound?.connectionId || null;
        let connection = preferredId
            ? await database_1.prisma.whatsappConnection.findFirst({
                where: { id: preferredId, status: 'ACTIVE' },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true },
            })
            : null;
        if (!connection) {
            connection = await database_1.prisma.whatsappConnection.findFirst({
                where: { status: 'ACTIVE', OR: [{ workspaceId }, { workspaceId: null }] },
                select: { id: true, phoneNumberId: true, accessTokenEnc: true },
            });
        }
        if (!connection)
            throw common_types_1.HttpError.badRequest('Nenhuma conexão ativa disponível');
        const accessToken = (0, token_encryption_1.decrypt)(connection.accessTokenEnc);
        const rawPhone = contact.phoneNormalized ?? '';
        const to = rawPhone.length === 11 && !rawPhone.startsWith('55') ? `55${rawPhone}` : rawPhone;
        // Determina extensão e mime final (força JPEG se desconhecido)
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        const finalMime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
        const filename = `image_${Date.now()}.${ext}`;
        const cloudApi = new cloud_api_service_1.CloudApiService();
        let mediaId;
        try {
            mediaId = await cloudApi.uploadMedia(connection.phoneNumberId, accessToken, imageBuffer, finalMime, filename);
            logger_1.logger.info({ mediaId, bytes: imageBuffer.length }, 'Image uploaded to Meta');
        }
        catch (uploadErr) {
            const errMsg = uploadErr instanceof Error ? uploadErr.message : 'Falha no upload de imagem';
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId, connectionId: connection.id,
                    direction: 'OUTBOUND', status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`, messageContent: caption || '🖼️ Imagem',
                    metaResponse: {}, sentAt: new Date(), failedAt: new Date(), errorMessage: errMsg,
                },
                select: { id: true, direction: true, status: true, messageContent: true, errorCode: true, errorMessage: true, sentAt: true, createdAt: true, connectionId: true, connection: { select: { id: true, name: true } }, metaResponse: true },
            });
            return msg;
        }
        const result = await cloudApi.sendImage(connection.phoneNumberId, accessToken, to, mediaId, caption || undefined);
        if (!result.success) {
            const msg = await database_1.prisma.message.create({
                data: {
                    contactId: lead.contactId, connectionId: connection.id,
                    direction: 'OUTBOUND', status: client_1.MessageStatus.FAILED,
                    wamid: `failed_${Date.now()}`, messageContent: caption || '🖼️ Imagem',
                    metaResponse: (result.rawResponse ?? {}),
                    sentAt: new Date(), failedAt: new Date(),
                    errorCode: result.error?.code ? String(result.error.code) : null,
                    errorMessage: result.error?.message ?? 'Falha ao enviar imagem',
                },
                select: { id: true, direction: true, status: true, messageContent: true, errorCode: true, errorMessage: true, sentAt: true, createdAt: true, connectionId: true, connection: { select: { id: true, name: true } }, metaResponse: true },
            });
            return msg;
        }
        const msg = await database_1.prisma.message.create({
            data: {
                contactId: lead.contactId, connectionId: connection.id,
                direction: 'OUTBOUND', status: client_1.MessageStatus.SENT,
                wamid: result.wamid ?? `manual_${Date.now()}`,
                messageContent: caption || null,
                metaResponse: { type: 'image', image: { id: mediaId, ...(caption && { caption }) } },
                sentAt: new Date(),
            },
            select: { id: true, direction: true, status: true, messageContent: true, errorCode: true, errorMessage: true, sentAt: true, createdAt: true, connectionId: true, connection: { select: { id: true, name: true } }, metaResponse: true },
        });
        await database_1.prisma.lead.update({ where: { id: leadId }, data: { lastMessageAt: new Date() } });
        return msg;
    }
    // ─── Dashboard ─────────────────────────────────────────────────────────────
    async getDashboardAdmin(workspaceId, from, to) {
        const now = new Date();
        const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        // Period boundaries
        const periodStart = from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodEnd = to ?? now;
        const daysDiff = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
        // ── Redis cache (30s TTL) ────────────────────────────────────────────────
        const cacheKey = redis_1.RedisKeys.dashboardAdminCache(workspaceId, periodStart.toISOString().slice(0, 13), periodEnd.toISOString().slice(0, 13));
        const cached = await redis_1.redis.get(cacheKey);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch { }
        }
        const inPeriod = (d) => !!d && d >= periodStart && d <= periodEnd;
        // ── Parallel queries ─────────────────────────────────────────────────────
        const [allLeads, users, stages, connections, initiatedByOpRaw, initiatedByDayRaw, initiatedByStageRaw, responseTimeByOpRaw, outreachRaw] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId },
                select: {
                    id: true,
                    status: true,
                    assignedToId: true,
                    stageId: true,
                    unreadCount: true,
                    lastMessageAt: true,
                    stageMovedAt: true,
                    createdAt: true,
                },
            }),
            database_1.prisma.leadUser.findMany({
                where: { workspaceId },
                select: { id: true, name: true, avatar: true, isActive: true, role: true },
                orderBy: { name: 'asc' },
            }),
            database_1.prisma.stage.findMany({
                where: { pipeline: { workspaceId } },
                select: { id: true, name: true, color: true, position: true },
                orderBy: { position: 'asc' },
            }),
            database_1.prisma.whatsappConnection.findMany({
                where: { workspaceId },
                select: { id: true, name: true, status: true, phoneNumberId: true },
                orderBy: { priority: 'desc' },
            }),
            // Iniciados: distinct leads with ≥1 outbound message in period, grouped by assignedToId
            // Iniciados por operador: leads cujo PRIMEIRO outbound ocorreu no período
            database_1.prisma.$queryRaw `
        SELECT l.assigned_to_id AS op_id, COUNT(*) AS cnt
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
        GROUP BY l.assigned_to_id
      `,
            // Timeline: leads cujo PRIMEIRO outbound foi no dia
            database_1.prisma.$queryRaw `
        SELECT to_char(date_trunc('day', fm.first_sent), 'YYYY-MM-DD') AS day, COUNT(*) AS cnt
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
        GROUP BY 1
      `,
            // Iniciados por etapa: leads cujo PRIMEIRO outbound ocorreu no período, agrupados pela etapa atual
            database_1.prisma.$queryRaw `
        SELECT l.stage_id, COUNT(*) AS cnt
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
        GROUP BY l.stage_id
      `,
            // T. resposta: for leads whose FIRST-EVER outbound message was in the period,
            // average time (minutes) from lead creation to that first message, per operator
            database_1.prisma.$queryRaw `
        SELECT l.assigned_to_id AS op_id,
               ROUND(AVG(EXTRACT(EPOCH FROM (fm.first_sent - l.created_at)) / 60))::int AS avg_min
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND l.assigned_to_id IS NOT NULL
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
          AND fm.first_sent > l.created_at
        GROUP BY l.assigned_to_id
      `,
            // ── Outreach funnel: primeira abordagem ─────────────────────────────────
            database_1.prisma.$queryRaw `
        SELECT
          COUNT(*) FILTER (WHERE first_message_sent_at IS NOT NULL)                           AS sent,
          COUNT(*) FILTER (WHERE first_message_delivered_at IS NOT NULL)                      AS delivered,
          COUNT(*) FILTER (WHERE first_message_read_at IS NOT NULL)                           AS read_c,
          COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)                               AS responded,
          COUNT(*) FILTER (WHERE message_count >= 2)                                          AS engaged,
          ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - first_message_sent_at)) / 60)
            FILTER (WHERE first_response_at IS NOT NULL AND first_message_sent_at IS NOT NULL))::int
                                                                                              AS avg_response_min
        FROM leads
        WHERE workspace_id = ${workspaceId}::uuid
          AND first_message_sent_at >= ${periodStart}
          AND first_message_sent_at <= ${periodEnd}
      `,
        ]);
        // ── Outreach funnel ───────────────────────────────────────────────────────
        const or = outreachRaw[0];
        const outreach = {
            sent: Number(or?.sent ?? 0),
            delivered: Number(or?.delivered ?? 0),
            read: Number(or?.read_c ?? 0),
            responded: Number(or?.responded ?? 0),
            engaged: Number(or?.engaged ?? 0),
            avgResponseMin: or?.avg_response_min != null ? Number(or.avg_response_min) : null,
        };
        // Build lookup maps
        const initiatedByOp = {};
        for (const r of initiatedByOpRaw) {
            if (r.op_id)
                initiatedByOp[r.op_id] = Number(r.cnt);
        }
        const initiatedByDay = {};
        for (const r of initiatedByDayRaw)
            initiatedByDay[r.day] = Number(r.cnt);
        const initiatedByStage = {};
        let totalInitiated = 0;
        for (const r of initiatedByStageRaw) {
            const cnt = Number(r.cnt);
            totalInitiated += cnt;
            if (r.stage_id)
                initiatedByStage[r.stage_id] = cnt;
        }
        const responseTimeByOp = {};
        for (const r of responseTimeByOpRaw)
            if (r.op_id)
                responseTimeByOp[r.op_id] = Number(r.avg_min);
        // ── Snapshot — current state of ALL leads ────────────────────────────────
        const total = allLeads.length;
        const disponivel = allLeads.filter(l => l.status === 'disponivel').length;
        const pego = allLeads.filter(l => l.status === 'pego').length;
        const em_andamento = allLeads.filter(l => l.status === 'em_andamento').length;
        const perdido = allLeads.filter(l => l.status === 'perdido').length;
        const active = pego + em_andamento;
        const conversionRate = total > 0 ? ((active / total) * 100).toFixed(1) : '0';
        const lossRate = total > 0 ? ((perdido / total) * 100).toFixed(1) : '0';
        // ── Period events ─────────────────────────────────────────────────────────
        // newLeads:    leads created in period
        // initiated:   leads with ≥1 outbound message in period (real contacts started)
        // stageMoves:  leads that changed stage in period
        // activeConvs: leads with any message activity in period
        const newLeads = allLeads.filter(l => inPeriod(l.createdAt)).length;
        const initiated = totalInitiated;
        const stageMoves = allLeads.filter(l => inPeriod(l.stageMovedAt)).length;
        const activeConvs = allLeads.filter(l => inPeriod(l.lastMessageAt)).length;
        // ── Alerts — current state ────────────────────────────────────────────────
        const leadsWithUnread = allLeads.filter(l => l.unreadCount > 0);
        const pendingReplies = leadsWithUnread.length;
        const totalUnread = leadsWithUnread.reduce((acc, l) => acc + l.unreadCount, 0);
        const unassigned = allLeads.filter(l => !l.assignedToId && l.status !== 'perdido').length;
        const stale = allLeads.filter(l => l.status === 'em_andamento' && l.lastMessageAt && l.lastMessageAt < staleThreshold).length;
        // ── Team — period metrics per operator ───────────────────────────────────
        const operators = users
            .filter(u => u.role === 'COLLABORATOR')
            .map(u => {
            const assigned = allLeads.filter(l => l.assignedToId === u.id);
            const opNewLeads = assigned.filter(l => inPeriod(l.createdAt)).length;
            const opInitiated = initiatedByOp[u.id] ?? 0;
            const opStageMoves = assigned.filter(l => inPeriod(l.stageMovedAt)).length;
            const opActiveConvs = assigned.filter(l => inPeriod(l.lastMessageAt)).length;
            const opUnreadTotal = assigned.reduce((acc, l) => acc + l.unreadCount, 0);
            const avgResponseMinutes = responseTimeByOp[u.id] ?? null;
            return {
                id: u.id,
                name: u.name,
                avatar: u.avatar ?? null,
                isActive: u.isActive,
                total: assigned.length,
                newLeads: opNewLeads,
                initiated: opInitiated,
                stageMoves: opStageMoves,
                activeConvs: opActiveConvs,
                unreadTotal: opUnreadTotal,
                avgResponseMinutes,
            };
        })
            .sort((a, b) => b.total - a.total);
        // ── Pipeline — snapshot count + initiated (outbound) per stage in period ────
        const stageCount = stages.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            count: allLeads.filter(l => l.stageId === s.id).length,
            initiatedInPeriod: initiatedByStage[s.id] ?? 0,
        }));
        const withoutStage = allLeads.filter(l => !l.stageId && l.status !== 'perdido').length;
        // ── Timeline — period events per day ──────────────────────────────────────
        const last14days = buildTimeline(daysDiff, periodStart).map(date => {
            const dateStart = new Date(date + 'T00:00:00.000Z');
            const dateEnd = new Date(date + 'T23:59:59.999Z');
            const inDay = (d) => !!d && d >= dateStart && d <= dateEnd;
            return {
                date,
                created: allLeads.filter(l => inDay(l.createdAt)).length,
                initiated: initiatedByDay[date] ?? 0,
            };
        });
        const result = {
            overview: { total, disponivel, pego, em_andamento, perdido, conversionRate, lossRate, newLeads, initiated, stageMoves, activeConvs },
            alerts: { pendingReplies, totalUnread, unassigned, stale },
            team: { totalOperators: operators.length, activeOperators: operators.filter(o => o.isActive).length, operators },
            pipeline: { stages: stageCount, withoutStage, initiatedTotal: totalInitiated },
            timeline: { last14days },
            connections: connections.map(c => ({ id: c.id, name: c.name, status: c.status, phoneNumberId: c.phoneNumberId })),
            outreach,
        };
        redis_1.redis.set(cacheKey, JSON.stringify(result), 'EX', 30).catch(() => { });
        return result;
    }
    async getDashboardOperator(userId, workspaceId, from, to) {
        const now = new Date();
        // Period boundaries
        const periodStart = from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodEnd = to ?? now;
        const daysDiff = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
        const inPeriod = (d) => !!d && d >= periodStart && d <= periodEnd;
        const [myLeads, myInitiatedRaw, myResponseTimeRaw] = await Promise.all([
            database_1.prisma.lead.findMany({
                where: { workspaceId, assignedToId: userId },
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    status: true,
                    unreadCount: true,
                    lastMessageAt: true,
                    stageMovedAt: true,
                    createdAt: true,
                    tags: true,
                    stageId: true,
                    stage: { select: { name: true, color: true } },
                },
                orderBy: { lastMessageAt: 'desc' },
            }),
            // Iniciados: leads cujo PRIMEIRO outbound ocorreu no período (primeiro contato da vida)
            database_1.prisma.$queryRaw `
        SELECT COUNT(*) AS cnt
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND l.assigned_to_id = ${userId}::uuid
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
      `,
            // T. resposta: leads whose first-ever outbound message was in the period
            database_1.prisma.$queryRaw `
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (fm.first_sent - l.created_at)) / 60))::int AS avg_min
        FROM (
          SELECT contact_id, MIN(sent_at) AS first_sent
          FROM messages
          WHERE direction = 'OUTBOUND'
          GROUP BY contact_id
        ) fm
        JOIN leads l ON l.contact_id = fm.contact_id
        WHERE l.workspace_id = ${workspaceId}::uuid
          AND l.assigned_to_id = ${userId}::uuid
          AND fm.first_sent >= ${periodStart}
          AND fm.first_sent <= ${periodEnd}
          AND fm.first_sent > l.created_at
      `,
        ]);
        // ── My Stats — snapshot ───────────────────────────────────────────────────
        const total = myLeads.length;
        const disponivel = myLeads.filter(l => l.status === 'disponivel').length;
        const pego = myLeads.filter(l => l.status === 'pego').length;
        const em_andamento = myLeads.filter(l => l.status === 'em_andamento').length;
        const perdido = myLeads.filter(l => l.status === 'perdido').length;
        const unreadTotal = myLeads.reduce((acc, l) => acc + l.unreadCount, 0);
        // ── Period events ─────────────────────────────────────────────────────────
        const newLeads = myLeads.filter(l => inPeriod(l.createdAt)).length;
        const initiated = Number(myInitiatedRaw[0]?.cnt ?? 0);
        const stageMoves = myLeads.filter(l => inPeriod(l.stageMovedAt)).length;
        const activeConvs = myLeads.filter(l => inPeriod(l.lastMessageAt)).length;
        const avgResponseMinutes = myResponseTimeRaw[0]?.avg_min != null ? Number(myResponseTimeRaw[0].avg_min) : null;
        // ── Priority queue — current state ────────────────────────────────────────
        const priority = [...myLeads]
            .filter(l => l.status !== 'perdido')
            .sort((a, b) => {
            if (b.unreadCount !== a.unreadCount)
                return b.unreadCount - a.unreadCount;
            const aTime = a.lastMessageAt?.getTime() ?? 0;
            const bTime = b.lastMessageAt?.getTime() ?? 0;
            return aTime - bTime;
        })
            .slice(0, 10)
            .map(l => ({
            id: l.id,
            name: l.name,
            phone: l.phone,
            status: l.status,
            unreadCount: l.unreadCount,
            lastMessageAt: l.lastMessageAt?.toISOString() ?? null,
            minutesSinceLastMessage: l.lastMessageAt
                ? Math.floor((now.getTime() - l.lastMessageAt.getTime()) / 60000)
                : null,
            stageName: l.stage?.name ?? null,
            stageColor: l.stage?.color ?? null,
            tags: l.tags,
        }));
        // ── Timeline — activity in period ─────────────────────────────────────────
        const last14days = buildTimeline(daysDiff, periodStart).map(date => {
            const dateStart = new Date(date + 'T00:00:00.000Z');
            const dateEnd = new Date(date + 'T23:59:59.999Z');
            return {
                date,
                converted: myLeads.filter(l => l.lastMessageAt && l.lastMessageAt >= dateStart && l.lastMessageAt <= dateEnd).length,
            };
        });
        return {
            myStats: { total, disponivel, pego, em_andamento, perdido, unreadTotal, newLeads, initiated, stageMoves, activeConvs, avgResponseMinutes },
            priority,
            timeline: { last14days },
        };
    }
    async listWorkspaces(leadUserId) {
        const me = await database_1.prisma.leadUser.findUnique({
            where: { id: leadUserId },
            select: { email: true, isActive: true },
        });
        if (!me || !me.isActive)
            throw common_types_1.HttpError.unauthorized('User not found or inactive');
        const others = await database_1.prisma.leadUser.findMany({
            where: { email: me.email, isActive: true },
            select: {
                workspaceId: true, role: true,
                workspace: { select: { id: true, name: true, slug: true, isActive: true } },
            },
        });
        return others
            .filter(u => u.workspace && u.workspace.isActive)
            .map(u => ({ workspaceId: u.workspace.id, workspaceName: u.workspace.name, workspaceSlug: u.workspace.slug, role: u.role }));
    }
    async switchWorkspace(leadUserId, workspaceSlug) {
        if (!workspaceSlug)
            throw common_types_1.HttpError.badRequest('workspaceSlug obrigatório');
        const me = await database_1.prisma.leadUser.findUnique({
            where: { id: leadUserId },
            select: { email: true, isActive: true },
        });
        if (!me || !me.isActive)
            throw common_types_1.HttpError.unauthorized('User not found or inactive');
        const target = await database_1.prisma.workspace.findUnique({ where: { slug: workspaceSlug.toLowerCase() } });
        if (!target || !target.isActive)
            throw common_types_1.HttpError.notFound('Workspace não encontrado');
        const tgtUser = await database_1.prisma.leadUser.findUnique({
            where: { workspaceId_email: { workspaceId: target.id, email: me.email } },
        });
        if (!tgtUser || !tgtUser.isActive)
            throw common_types_1.HttpError.forbidden('Sem acesso a este workspace');
        const token = this.app.jwt.sign({
            sub: tgtUser.id, role: tgtUser.role, type: 'lead',
            workspaceId: target.id, permissions: tgtUser.permissions ?? {},
        }, { expiresIn: '30d' });
        return {
            token,
            user: { id: tgtUser.id, name: tgtUser.name, email: tgtUser.email, role: tgtUser.role, permissions: tgtUser.permissions ?? {} },
            workspace: { id: target.id, name: target.name, slug: target.slug },
        };
    }
    // ─── Blacklist de telefones ─────────────────────────────────────────────
    async listBlockedPhones(workspaceId) {
        const rows = await database_1.prisma.blockedPhone.findMany({
            where: { workspaceId },
            select: { id: true, phone: true, blockedAt: true },
            orderBy: { blockedAt: 'desc' },
        });
        return { data: rows };
    }
    async addBlockedPhone(phone, workspaceId) {
        if (!phone || typeof phone !== 'string')
            throw common_types_1.HttpError.badRequest('Telefone obrigatório');
        const digits = phone.replace(/\D/g, '');
        if (!digits)
            throw common_types_1.HttpError.badRequest('Telefone inválido');
        const variants = (0, phone_normalizer_1.brazilianPhoneVariants)(digits);
        await Promise.all(variants.map(p => database_1.prisma.blockedPhone.upsert({
            where: { phone: p },
            create: { phone: p, workspaceId },
            update: { blockedAt: new Date() },
        })));
        return { success: true, phones: variants };
    }
    async removeBlockedPhone(phone, workspaceId) {
        if (!phone)
            throw common_types_1.HttpError.badRequest('Telefone obrigatório');
        const digits = phone.replace(/\D/g, '');
        const variants = (0, phone_normalizer_1.brazilianPhoneVariants)(digits);
        await database_1.prisma.blockedPhone.deleteMany({
            where: { phone: { in: variants }, workspaceId },
        });
        return { success: true };
    }
}
exports.LeadsService = LeadsService;
function buildTimeline(days, from) {
    const result = [];
    const start = from
        ? new Date(from.getFullYear(), from.getMonth(), from.getDate())
        : (() => {
            const today = new Date();
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            d.setDate(d.getDate() - (days - 1));
            return d;
        })();
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        result.push(d.toISOString().slice(0, 10));
    }
    return result;
}
//# sourceMappingURL=leads.service.js.map