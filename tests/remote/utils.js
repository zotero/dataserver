/**
 * Shared test utilities
 */

/**
 * Generate a random alphanumeric string
 *
 * @param {Number} length
 * @return {String}
 */
export function randomString(length) {
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}
