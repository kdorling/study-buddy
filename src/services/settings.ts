import { Store } from '@tauri-apps/plugin-store';

let store: Store | null = null;

async function getStore(): Promise<Store> {
    if (!store) {
        store = await Store.load('settings.json');
    }
    return store;
}

export async function getApiKey(): Promise<string | null> {
    const s = await getStore();
    return (await s.get<string>('gemini_api_key')) || null;
}

export async function setApiKey(key: string): Promise<void> {
    const s = await getStore();
    await s.set('gemini_api_key', key);
    await s.save();
}

export async function getModel(): Promise<string> {
    const s = await getStore();
    return (await s.get<string>('gemini_model')) || 'gemini-2.0-flash';
}

export async function setModel(model: string): Promise<void> {
    const s = await getStore();
    await s.set('gemini_model', model);
    await s.save();
}
