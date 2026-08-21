/**
 * Configuration management for olcli
 */
import Conf from 'conf';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const config = new Conf({
    projectName: 'olcli',
    schema: {
        sessionCookie: { type: 'string' },
        csrf: { type: 'string' },
        lastProject: { type: 'string' },
        baseUrl: { type: 'string' },
        sessionCookieName: { type: 'string' }
    }
});
export function getBaseUrl() {
    return process.env.OVERLEAF_BASE_URL || config.get('baseUrl') || 'https://www.overleaf.com';
}
export function setBaseUrl(url) {
    config.set('baseUrl', url);
}
export function getSessionCookieName() {
    return process.env.OVERLEAF_COOKIE_NAME || config.get('sessionCookieName') || 'overleaf_session2';
}
export function setSessionCookieName(name) {
    config.set('sessionCookieName', name);
}
export function getSessionCookie() {
    // Check environment variable first
    if (process.env.OVERLEAF_SESSION) {
        return process.env.OVERLEAF_SESSION;
    }
    // Check .olauth file in current directory
    const olAuthPath = join(process.cwd(), '.olauth');
    if (existsSync(olAuthPath)) {
        try {
            const content = readFileSync(olAuthPath, 'utf-8').trim();
            // Parse cookie from olauth file (format: key=value or just value)
            if (content.includes('=')) {
                const cookies = content.split(';').map(c => c.trim());
                const cookieName = getSessionCookieName();
                const sessionCookie = cookies.find(c => c.startsWith(`${cookieName}=`));
                if (sessionCookie) {
                    return sessionCookie.split('=')[1];
                }
            }
            return content;
        }
        catch {
            // Ignore errors
        }
    }
    // Check global config
    return config.get('sessionCookie');
}
export function setSessionCookie(cookie) {
    config.set('sessionCookie', cookie);
}
export function getCsrf() {
    return config.get('csrf');
}
export function setCsrf(csrf) {
    config.set('csrf', csrf);
}
export function getLastProject() {
    return config.get('lastProject');
}
export function setLastProject(projectId) {
    config.set('lastProject', projectId);
}
export function clearConfig() {
    config.clear();
}
export function getConfigPath() {
    return config.path;
}
/**
 * Save session cookie in .olauth format for compatibility
 */
export function saveOlAuth(cookie, path) {
    const authPath = path || join(process.cwd(), '.olauth');
    writeFileSync(authPath, `${getSessionCookieName()}=${cookie}`, 'utf-8');
}
//# sourceMappingURL=config.js.map