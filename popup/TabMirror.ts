import assert from '../lib/assert.js';
import assertDefined from '../lib/assertDefined.js';
import logError from '../lib/logError.js';
import bt = browser.tabs;
import bw = browser.windows;

type RequireValues<T, K extends keyof T> = T & Required<Pick<T, K>>;

function requireValues<T, K extends keyof T>(obj: T, ...keys: K[]) {
	for (let k of keys) {
		if (obj[k] == null) {
			throw new Error(`Value for field ${k} is required`);
		}
	}
	return obj as RequireValues<T, K>;
}

export type TWindow = ReturnType<typeof convertWindow>;

function convertWindow(wndw: bw.Window) {
	let { id, type, state, focused, tabs } = requireValues(wndw, 'id', 'type', 'state', 'tabs');
	assert(type === 'normal');
	assert(id !== bw.WINDOW_ID_NONE);
	
	// TODO: last focused
	return {
		id,
		state,
		focused,
		tabs: tabs.map(t => assertDefined(t.id)),
		activeTabId: assertDefined(tabs.filter(t => t.active).single().id),
	};
}

export interface TTab extends ReturnType<typeof convertTab> {}

function convertTab(tab: bt.Tab) {
	return requireValues(tab, 'id', 'url', 'discarded', 'status', 'title', 'windowId');
	// TODO: remove "active" property
}

type OnTabCreated = Parameters<typeof bt.onCreated.addListener>[0];
type OnTabRemoved = Parameters<typeof bt.onRemoved.addListener>[0];
type OnTabUpdated = Parameters<typeof bt.onUpdated.addListener>[0];
type OnTabActivated = Parameters<typeof bt.onActivated.addListener>[0];

export default class TabMirror {

	listeners = new Set<() => void>();

	private windows = new Map<number, TWindow>();
	
	private tabs = new Map<number, TTab>();

	constructor() {
		this.loadAll().then(() => {
			// Tab event handlers
			bw.onCreated.addListener(w => {
				console.log('window created', w);
			});
			bt.onCreated.addListener(this.handleTabCreated);
			bt.onRemoved.addListener(this.handleTabRemoved);
			bt.onActivated.addListener(this.handleTabActivated);
			try {
				// Firefox is the only browser that currently supports filters
				bt.onUpdated.addListener(this.handleTabUpdate, { properties: ['title', 'status', 'favIconUrl', 'discarded'] });
			} catch {
				bt.onUpdated.addListener(this.handleTabUpdate);
			}
		}).catch(logError);
	}

	dispose() {
		bt.onCreated.removeListener(this.handleTabCreated);
		bt.onRemoved.removeListener(this.handleTabRemoved);
		bt.onActivated.removeListener(this.handleTabActivated);
		bt.onUpdated.removeListener(this.handleTabUpdate);
	}

	private async loadAll() {
		let windows = (await bw.getAll({ windowTypes: ['normal'], populate: true }));
		this.windows = windows.map(convertWindow).toMap(w => w.id);
		this.tabs = windows.flatMap(w => Array.from(w.tabs!.values(), convertTab)).toMap(t => t.id);
		this.notify();
	}

	private handleTabCreated: OnTabCreated = x => {
		let tab = convertTab(x);
		// TODO: respect tab.index
		this.windows.getOrThrow(tab.windowId).tabs.push(tab.id);
		this.tabs.set(tab.id, tab);
		this.notify();
	};

	private handleTabRemoved: OnTabRemoved = (tabId, { windowId, isWindowClosing }) => {
		let w = this.windows.get(windowId);
		if (w == null) {
			return; // Other windowType
		}
		// Remove entire window?
		if (isWindowClosing) {
			this.windows.delete(windowId);

		} else {
			// Remove tab from window
			let index = w.tabs.indexOf(tabId);
			assert(index !== -1);
			w.tabs.splice(index, 1);
		}

		// Remove from tabs
		assert(this.tabs.delete(tabId));

		this.notify();
	};

	/**
	 * When the active tab in a window changes
	 */
	private handleTabActivated: OnTabActivated = ({ tabId, windowId }) => {
		let w = this.windows.get(windowId);
		if (w == null) {
			return; // Other windowType
		}
		// TODO: manually update lastAccessed
		// TODO: update selectedTabId
		w.activeTabId = tabId;
		this.notify();
	};

	/**
	 * Informs us whenever a tab property updates
	 */
	private handleTabUpdate: OnTabUpdated = (tabId, info, fullTab) => {
		// w.tabs.set(tabId, convertTab(fullTab));
		let tab = this.tabs.get(tabId);
		if (tab == null) {
			return; // Other windowType
		}
		Object.assign(tab, info);
		tab.lastAccessed = fullTab.lastAccessed;
		this.notify();
	};

	private notify() {
		for (let listener of this.listeners) {
			listener();
		}
	}

	getWindows(): ReadonlyMap<number, Readonly<TWindow>> {
		return this.windows;
	}

	getTabs(): ReadonlyMap<number, Readonly<TTab>> {
		return this.tabs;
	}
}
