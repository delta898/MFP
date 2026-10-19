const test = require('node:test');
const assert = require('node:assert/strict');

const { createSupabaseSurfaceContentProvider } = require('./surface-content-provider');

function createProvider() {
    return createSupabaseSurfaceContentProvider({
        config: {
            SUPABASE_PUBLIC_CONFIG: {
                configured: true,
                url: 'https://example.supabase.co',
                publishableKey: 'public-test-key'
            }
        },
        createClient: () => ({ rpc: async () => ({ data: null, error: null }) }),
        logger: { debug() {} }
    });
}

test('Supabase surface provider resolves only supported public Storage images', () => {
    const provider = createProvider();
    const media = provider.resolveMedia({
        kind: 'image',
        transport: 'supabase_storage',
        bucket: 'app-public-content',
        object_path: 'surface-content/guide image.webp',
        mime_type: 'image/webp',
        alt: 'Guide cover',
        width: 1200,
        height: 800,
        revision: 2
    });

    assert.deepEqual(media, {
        url: 'https://example.supabase.co/storage/v1/object/public/app-public-content/surface-content/guide%20image.webp?v=2',
        mimeType: 'image/webp',
        alt: 'Guide cover',
        width: 1200,
        height: 800,
        revision: 2
    });
});

test('Supabase surface provider rejects unsupported buckets and unsafe object paths', () => {
    const provider = createProvider();
    const base = {
        kind: 'image',
        transport: 'supabase_storage',
        bucket: 'app-public-content',
        object_path: 'surface-content/guide.webp',
        mime_type: 'image/webp',
        width: 1200,
        height: 800,
        revision: 2
    };

    assert.equal(provider.resolveMedia({ ...base, bucket: 'private' }), null);
    assert.equal(provider.resolveMedia({ ...base, object_path: 'surface-content/../secret.webp' }), null);
});
