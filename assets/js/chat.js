import { state } from './state.js';
import { supabaseClient } from './config.js';
import { showToast } from './utils.js';
import { compressImage } from './imageUtils.js';

const chatDrafts = {
    modal: null,
    thread: null
};

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function clearDraft(kind) {
    const draft = chatDrafts[kind];
    if (draft?.previewUrl) {
        URL.revokeObjectURL(draft.previewUrl);
    }
    chatDrafts[kind] = null;
    const preview = document.getElementById(`${kind === 'modal' ? 'message' : 'chat'}-image-preview`);
    if (preview) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
    }
    const input = document.getElementById(`${kind === 'modal' ? 'message' : 'chat'}-image-input`);
    if (input) input.value = '';
}

function renderDraftPreview(kind) {
    const draft = chatDrafts[kind];
    const preview = document.getElementById(`${kind === 'modal' ? 'message' : 'chat'}-image-preview`);
    if (!preview) return;

    if (!draft) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
        return;
    }

    preview.classList.remove('hidden');
    preview.innerHTML = `
        <div class="chat-image-preview-wrap">
            <img src="${escapeAttr(draft.previewUrl)}" alt="Pregled slike">
            <button type="button" class="chat-preview-remove" aria-label="Ukloni sliku">×</button>
        </div>
    `;

    const removeBtn = preview.querySelector('.chat-preview-remove');
    if (removeBtn) {
        removeBtn.onclick = () => clearDraft(kind);
    }
}

async function prepareChatDraft(file) {
    const thumbnailFile = await compressImage(file, 10, 256);
    const fullFile = await compressImage(file, 100, 1200);
    return {
        thumbnailFile,
        fullFile,
        previewUrl: URL.createObjectURL(thumbnailFile)
    };
}

async function uploadChatImage(draft) {
    const fileBase = `${state.currentUser.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullName = `chat/${fileBase}.webp`;
    const thumbName = `chat/${fileBase}_thumb.webp`;

    const { error: fullUploadError } = await supabaseClient.storage.from('oglasi').upload(fullName, draft.fullFile, {
        contentType: 'image/webp'
    });
    if (fullUploadError) throw fullUploadError;

    const { error: thumbUploadError } = await supabaseClient.storage.from('oglasi').upload(thumbName, draft.thumbnailFile, {
        contentType: 'image/webp'
    });
    if (thumbUploadError) {
        await supabaseClient.storage.from('oglasi').remove([fullName]);
        throw thumbUploadError;
    }

    const { data: fullData } = supabaseClient.storage.from('oglasi').getPublicUrl(fullName);
    const { data: thumbData } = supabaseClient.storage.from('oglasi').getPublicUrl(thumbName);

    return {
        fullUrl: fullData.publicUrl,
        thumbUrl: thumbData.publicUrl
    };
}

function parseMessageContent(content) {
    if (!content) {
        return { type: 'text', text: '' };
    }

    try {
        const parsed = JSON.parse(content);
        if (parsed && parsed.type === 'image') {
            return {
                type: 'image',
                text: parsed.text || '',
                thumbUrl: parsed.thumbUrl || parsed.thumbnailUrl || parsed.imageUrl || '',
                fullUrl: parsed.fullUrl || parsed.fullImageUrl || parsed.imageUrl || parsed.thumbUrl || ''
            };
        }
    } catch (_) {
        // Plain text message.
    }

    return { type: 'text', text: content };
}

function getMessagePreview(content) {
    const parsed = parseMessageContent(content);
    if (parsed.type === 'image') {
        return parsed.text ? `Slika: ${parsed.text}` : 'Slika';
    }

    const text = parsed.text.trim();
    return text || 'Poruka';
}

function buildMessageContent(text, imagePayload) {
    if (imagePayload) {
        return JSON.stringify({
            type: 'image',
            text: text || '',
            thumbUrl: imagePayload.thumbUrl,
            fullUrl: imagePayload.fullUrl
        });
    }

    return text;
}

async function sendChatMessage({
    adId,
    receiverId,
    inputEl,
    sendBtn,
    draftKind,
    onSuccess
}) {
    const text = inputEl ? inputEl.value.trim() : '';
    const draft = chatDrafts[draftKind];
    if (!text && !draft) return;

    const originalText = sendBtn.innerText;
    sendBtn.innerText = 'Slanje...';
    sendBtn.disabled = true;

    try {
        let imagePayload = null;
        if (draft) {
            sendBtn.innerText = 'Spremam sliku...';
            imagePayload = await uploadChatImage(draft);
        }

        const content = buildMessageContent(text, imagePayload);
        const { error } = await supabaseClient.from('poruke').insert([{
            oglas_id: adId,
            sender_id: state.currentUser.id,
            receiver_id: receiverId,
            content,
            sender_name: state.currentUser.user_metadata?.full_name || 'Susjed',
            is_read: false
        }]);

        if (error) throw error;

        if (inputEl) inputEl.value = '';
        clearDraft(draftKind);
        showToast('Poruka poslana!');
        if (onSuccess) onSuccess();
    } catch (error) {
        showToast(`Greška pri slanju: ${error.message}`, 'error');
    } finally {
        sendBtn.innerText = originalText;
        sendBtn.disabled = false;
    }
}

function wireImageComposer(kind) {
    const prefix = kind === 'modal' ? 'message' : 'chat';
    const attachBtn = document.getElementById(`${prefix}-image-btn`);
    const fileInput = document.getElementById(`${prefix}-image-input`);
    const preview = document.getElementById(`${prefix}-image-preview`);
    if (!attachBtn || !fileInput || !preview) return;

    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = async (event) => {
        if (event.target.files && event.target.files[0]) {
            try {
                const draft = await prepareChatDraft(event.target.files[0]);
                if (chatDrafts[kind]?.previewUrl) {
                    URL.revokeObjectURL(chatDrafts[kind].previewUrl);
                }
                chatDrafts[kind] = draft;
                renderDraftPreview(kind);
            } catch (error) {
                showToast('Greška pri obradi slike.', 'error');
            }
        } else {
            clearDraft(kind);
        }
    };

    renderDraftPreview(kind);
}

export function handleRespond(adId, receiverId, adDescription) {
    if (!state.currentUser) return;
    const modal = document.getElementById('message-modal');
    const adInfo = document.getElementById('modal-ad-info');
    const sendBtn = document.getElementById('send-msg-btn');
    const closeBtn = document.getElementById('close-modal');
    const messageInput = document.getElementById('message-text');

    if (adInfo) adInfo.innerText = `Oglas: "${adDescription}"`;
    if (messageInput) messageInput.value = '';
    clearDraft('modal');
    wireImageComposer('modal');

    if (!modal || !sendBtn || !closeBtn) return;

    modal.classList.add('active');
    closeBtn.onclick = () => {
        modal.classList.remove('active');
        clearDraft('modal');
    };

    sendBtn.onclick = async () => {
        await sendChatMessage({
            adId,
            receiverId,
            inputEl: messageInput,
            sendBtn,
            draftKind: 'modal',
            onSuccess: () => {
                modal.classList.remove('active');
                if (messageInput) messageInput.value = '';
                clearDraft('modal');
            }
        });
    };
}

export async function fetchMessages() {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList || !state.currentUser) return;

    const { data, error } = await supabaseClient.from('poruke')
        .select(`*, oglas_id (id, description, expires_at, user_id)`)
        .or(`sender_id.eq.${state.currentUser.id},receiver_id.eq.${state.currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) return;

    const now = new Date();
    const conversations = {};
    let totalUnread = 0;

    data.forEach(msg => {
        const oglas = msg.oglas_id;
        if (!oglas) return;

        const expiryDate = new Date(oglas.expires_at);
        const cutoffDate = new Date(expiryDate.getTime() + (24 * 60 * 60 * 1000));
        if (now > cutoffDate) return;

        const otherUserId = (msg.sender_id === state.currentUser.id) ? msg.receiver_id : msg.sender_id;
        const otherUserName = (msg.sender_id !== state.currentUser.id) ? msg.sender_name : null;
        const convKey = `${oglas.id}_${otherUserId}`;

        if (!conversations[convKey]) {
            conversations[convKey] = {
                title: oglas.description,
                adId: oglas.id,
                adOwnerId: oglas.user_id,
                otherUserId,
                otherUserName: otherUserName || 'Susjed',
                messages: [],
                lastMsg: getMessagePreview(msg.content),
                time: msg.created_at
            };
        } else if (otherUserName && conversations[convKey].otherUserName === 'Susjed') {
            conversations[convKey].otherUserName = otherUserName;
        }
        conversations[convKey].messages.push(msg);
        conversations[convKey].lastMsg = getMessagePreview(msg.content);

        if (msg.receiver_id === state.currentUser.id && !msg.is_read) {
            totalUnread++;
        }
    });

    const badge = document.getElementById('unread-badge');
    if (badge) {
        if (totalUnread > 0) {
            badge.innerText = totalUnread > 99 ? '99+' : totalUnread;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (state.activeConversationAdId) {
        const currentConv = conversations[state.activeConversationAdId];
        if (currentConv) renderChatThread(currentConv);
        else renderConversations(conversations);
    } else {
        renderConversations(conversations);
    }
}

function renderConversations(conversations) {
    const messagesList = document.getElementById('messages-list');
    if (Object.keys(conversations).length === 0) {
        messagesList.innerHTML = '<p class="empty-state">Još nemaš aktivnih razgovora.</p>';
        return;
    }

    messagesList.innerHTML = '';
    const sortedConvs = Object.values(conversations).sort((a, b) => new Date(b.time) - new Date(a.time));

    sortedConvs.forEach(conv => {
        const convKey = `${conv.adId}_${conv.otherUserId}`;
        const card = document.createElement('div');
        card.className = 'conversation-card';
        card.innerHTML = `
            <div class="conv-header"><span class="conv-meta">Oglas: ${escapeHtml(conv.title)}</span></div>
            <div class="conv-user-name">${escapeHtml(conv.otherUserName)}</div>
            <p class="conv-last-msg">${escapeHtml(conv.lastMsg)}</p>
        `;
        card.onclick = () => {
            state.activeConversationAdId = convKey;
            renderChatThread(conv);
        };
        messagesList.appendChild(card);
    });
}

function renderChatThread(conv) {
    const messagesList = document.getElementById('messages-list');
    const currentInput = document.getElementById('chat-reply-input');
    const savedValue = currentInput ? currentInput.value : '';
    const wasFocused = currentInput === document.activeElement;

    messagesList.innerHTML = `
        <div class="chat-thread-container">
            <div class="thread-header">
                <button class="back-btn" onclick="window.goBackToConversations()">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div class="thread-info">
                    <div class="thread-user-name">${escapeHtml(conv.otherUserName)}</div>
                    <div class="thread-ad-title">Oglas: ${escapeHtml(conv.title)}</div>
                </div>
            </div>
            <div class="messages-scroller thread-scroller" id="thread-scroller"></div>
            <div class="chat-input-bar">
                <button type="button" id="chat-image-btn" class="chat-attach-btn chat-attach-btn-inline" aria-label="Dodaj sliku">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="7" width="18" height="12" rx="2"></rect>
                        <path d="M8 7l1.6-3h4.8L16 7"></path>
                        <circle cx="12" cy="13" r="3"></circle>
                    </svg>
                </button>
                <input type="file" id="chat-image-input" accept="image/*" class="hidden-file-input">
                <input type="text" id="chat-reply-input" placeholder="Napiši poruku...">
                <button class="chat-send-btn" id="chat-reply-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
            <div id="chat-image-preview" class="chat-image-preview hidden"></div>
        </div>
    `;

    const newInput = document.getElementById('chat-reply-input');
    if (newInput) {
        newInput.value = savedValue;
        if (wasFocused) newInput.focus();
    }

    wireImageComposer('thread');

    const scroller = document.getElementById('thread-scroller');
    const threadMsgs = [...conv.messages].reverse();

    threadMsgs.forEach(msg => {
        const isSender = msg.sender_id === state.currentUser.id;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isSender ? 'sent' : 'received'}`;

        const parsed = parseMessageContent(msg.content);
        const timeStr = new Date(msg.created_at).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(msg.created_at).toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
        const isToday = new Date(msg.created_at).toDateString() === new Date().toDateString();
        const displayTime = isToday ? timeStr : `${dateStr}, ${timeStr}`;

        const statusText = isSender ? (msg.is_read ? 'Pročitano' : 'Poslano') : '';
        const imageMarkup = parsed.type === 'image' ? `
            <img src="${escapeAttr(parsed.thumbUrl || parsed.fullUrl)}"
                 data-full-image-url="${escapeAttr(parsed.fullUrl || parsed.thumbUrl)}"
                 class="chat-message-image"
                 loading="lazy"
                 onclick="window.openImageModal(this.dataset.fullImageUrl || this.src)">
        ` : '';
        const captionMarkup = parsed.type === 'image' && parsed.text ? `<div class="chat-message-caption">${escapeHtml(parsed.text)}</div>` : '';
        const textMarkup = parsed.type === 'text' && parsed.text ? `<div class="bubble-text">${escapeHtml(parsed.text)}</div>` : '';

        bubble.innerHTML = `
            <div class="bubble-name">${isSender ? 'Ja' : escapeHtml(msg.sender_name || 'Susjed')}</div>
            ${imageMarkup}
            ${captionMarkup}
            ${textMarkup}
            <span class="bubble-time">
                ${displayTime}
                ${statusText ? `<span class="message-status">${statusText}</span>` : ''}
            </span>
        `;
        scroller.appendChild(bubble);

        if (!isSender && !msg.is_read) {
            supabaseClient.from('poruke').update({ is_read: true }).eq('id', msg.id).then();
        }
    });

    if (conv.messages.length > state.lastMessageCount) {
        setTimeout(() => {
            if (scroller) {
                scroller.scrollTop = scroller.scrollHeight;
            }
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        }, 200);
        state.lastMessageCount = conv.messages.length;
    }

    const replyBtn = document.getElementById('chat-reply-btn');
    const replyInput = document.getElementById('chat-reply-input');

    replyBtn.onclick = async () => {
        await sendChatMessage({
            adId: conv.adId,
            receiverId: conv.otherUserId,
            inputEl: replyInput,
            sendBtn: replyBtn,
            draftKind: 'thread',
            onSuccess: () => fetchMessages()
        });
    };
}

export function goBackToConversations() {
    state.activeConversationAdId = null;
    state.lastMessageCount = 0;
    clearDraft('thread');
    fetchMessages();
}

export function initRealtime() {
    if (!state.currentUser) return;
    if (state.realtimeChannel) supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = supabaseClient
        .channel('realtime-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poruke', filter: `receiver_id=eq.${state.currentUser.id}` }, () => fetchMessages())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poruke', filter: `sender_id=eq.${state.currentUser.id}` }, () => fetchMessages())
        .subscribe();

    fetchMessages();
}
