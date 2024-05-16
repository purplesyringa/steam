"use strict";

(() => {

// Constants from Document for UglifyJS
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// Constants from NodeFilter for UglifyJS
const SHOW_ELEMENT = 1;
const SHOW_TEXT = 4;

const KIND_COMPONENT = 0;
const KIND_CONTENT = 1;
const KIND_ATTRIBUTE = 2;
const KIND_ATTRIBUTE_REST = 3;
const KIND_PROP = 4;
const KIND_PROP_REST = 5;

const templateCache = new Map();
let currentComponentInstance = null;

const Steam = (strings, ...args) => {
	if (!currentComponentInstance) {
		throw new Error("Steam`` can only be used in a reactive constant, e.g. in Steam.attach");
	}

	let precompiled = templateCache.get(strings);
	if (!precompiled) {
		precompiled = precompile(strings);
		templateCache.set(strings, precompiled);
	}

	const argBindingInfo = {};

	const handleComponentArg = (componentIndex, node, attributes) => {
		const props = { "children": [ ...node.childNodes ] };
		for (const attribute of node.attributes) {
			props[attributeNameToPropName(attribute.name)] = attribute.value;
		}
		for (const { name, valueIndex } of attributes) {
			const value = args[valueIndex];
			if (name === "") {
				for(const [ propName, propValue ] of Object.entries(value)) {
					applyProp(propName, propValue, props);
				}
				argBindingInfo[valueIndex] = {
					bindingKind: KIND_PROP_REST,
					componentIndex,
					currentNames: Object.keys(value),
				};
			} else {
				const propName = attributeNameToPropName(name);
				applyProp(propName, value, props);
				argBindingInfo[valueIndex] = {
					bindingKind: KIND_PROP,
					componentIndex,
					name: propName,
				};
			}
		}
		Object.freeze(props);

		const componentFn = args[componentIndex];
		const instance = newComponentInstance(componentFn, props);
		const nodes = renderComponentInstance(instance);
		if (nodes.length === 0) {
			nodes.push(document.createComment("Steam whiteout"));
		}

		argBindingInfo[componentIndex] = {
			bindingKind: KIND_COMPONENT,
			instance,
		};

		node.replaceWith(...nodes);
	};

	const handleContentArg = (contentIndex, node, ofComponentIndex) => {
		let value = [];
		const flatten = item => {
			if (!Array.isArray(item)) {
				if (item || typeof item === "number") {
					value.push(item);
				}
				return;
			}
			for (const nested of item) {
				flatten(nested);
			}
		};
		flatten(args[contentIndex]);
		if (value.length === 0) {
			value.push("");
		}
		if (node.nodeType === TEXT_NODE && value.length === 1 && !(value[0] instanceof Node)) {
			if (typeof value[0] === "string") {
				node.nodeValue = value[0];
			} else {
				node.nodeValue = JSON.stringify(value[0]);
			}
			argBindingInfo[contentIndex] = {
				bindingKind: KIND_CONTENT,
				nodes: [ node ],
			};
			return null;
		}
		const nodes = value.map(item => {
			if (typeof item === "string") {
				item = document.createTextNode(item);
			}
			if (!(item instanceof Node)) {
				item = document.createTextNode(JSON.stringify(item));
			}
			return item;
		});
		node.replaceWith(...nodes);
		argBindingInfo[contentIndex] = {
			bindingKind: KIND_CONTENT,
			ofComponentIndex,
			nodes,
		};
		return nodes;
	};

	const handleAttributeArg = (name, valueIndex, node) => {
		argBindingInfo[valueIndex] = {
			bindingKind: KIND_ATTRIBUTE,
			node,
			name,
		};
		applyAttribute(name, args[valueIndex], node);
	};

	const removeAttribute = (name, node) => {
		if (name === "children") {
			node.innerHTML = "";
		} else if (name.startsWith("on")) {
			node[name] = null;
		} else {
			node.removeAttribute(name);
		}
	};

	const applyAttribute = (name, value, node) => {
		if (name === "children") {
			if (node.childNodes.length > 0 && value.length > 0) {
				throw new Error(`children prop should not be present if the node already contains data`);
			}
			node.append(...value);
			return;
		}

		if (name === "dangerously-set-inner-html") {
			if (node.childNodes.length > 0) {
				throw new Error(`dangerouslySetInnerHtml prop should not be present if the node already contains data`);
			}
			node.innerHTML = value.__html;
			return;
		}

		if (name === "value") {
			node.value = value;
			return;
		}

		if (name.startsWith("on")) {
			if (node[name]) {
				throw new Error(`Duplicate event handler ${name}`);
			}
			node[name] = value;
			return;
		}

		if (node.hasAttribute(name)) {
			throw new Error(`Duplicate attribute ${name}`);
		}
		if (name === "class" && Array.isArray(value)) {
			node.classList.add(...value);
		} else if (name === "class" && typeof value === "object" && value !== null) {
			for (const [ className, enabled ] of Object.entries(value)) {
				node.classList.toggle(className, enabled);
			}
		} else if (name === "style" && typeof value === "object" && value !== null) {
			Object.assign(node.style, value);
		} else if (typeof value === "boolean") {
			if (value) {
				node.setAttribute(name, name);
			}
		} else {
			node.setAttribute(name, value);
		}
	};

	const applyProp = (name, value, props) => {
		if ((name in props) && !(name === "children" && (value.length === 0 || props["children"].length === 0))) {
			throw new Error(`Key ${name} overrides an existing property of the same name`);
		}
		props[name] = value;
	};

	let cacheGroup = currentComponentInstance.nodeCache.get(strings);
	if (!cacheGroup) {
		cacheGroup = {
			nodePosition: 0,
			nodeList: [],
		};
		currentComponentInstance.nodeCache.set(strings, cacheGroup);
	}
	if (cacheGroup.nodePosition < cacheGroup.nodeList.length) {
		const { nodes, args: oldArgs, argBindingInfo } = cacheGroup.nodeList[cacheGroup.nodePosition++];

		const componentInstancesToRerender = {};
		const rerenderedComponentProps = index => {
			let props = componentInstancesToRerender[index];
			if (!props) {
				props = { ...argBindingInfo[index].instance.props };
				argBindingInfo[index].instance.props = props;
				componentInstancesToRerender[index] = props;
			}
			return props;
		};

		oldArgs.forEach((oldArg, index) => {
			if (oldArg === args[index]) {
				return;
			}
			const bindingInfo = argBindingInfo[index];
			switch (bindingInfo.bindingKind) {
			case KIND_COMPONENT:
				rerenderedComponentProps(index);
				break;
			case KIND_CONTENT:
				const { ofComponentIndex, nodes } = bindingInfo;
				for (const node of nodes.slice(1)) {
					node.remove();
				}
				const newNodes = handleContentArg(index, nodes[0], ofComponentIndex);
				if (ofComponentIndex !== null && newNodes !== null) {
					const children = argBindingInfo[ofComponentIndex].instance.props["children"];
					const indexBegin = children.indexOf(nodes[0]);
					const indexEnd = children.indexOf(nodes[nodes.length - 1]) + 1;
					children.splice(indexBegin, indexEnd - indexBegin, newNodes);
				}
				break;
			case KIND_ATTRIBUTE:
				removeAttribute(bindingInfo.name, bindingInfo.node);
				handleAttributeArg(bindingInfo.name, index, bindingInfo.node);
				break;
			case KIND_ATTRIBUTE_REST:
				for (const attrName of bindingInfo.currentNames) {
					removeAttribute(attrName, bindingInfo.node);
				}
				for (const [ propName, propValue ] of Object.entries(args[index])) {
					applyAttribute(propNameToAttributeName(propName), propValue, bindingInfo.node);
				}
				bindingInfo.currentNames = Object.keys(args[index]).map(propNameToAttributeName);
				break;
			case KIND_PROP:
				rerenderedComponentProps(bindingInfo.componentIndex)[bindingInfo.name] = args[index];
				break;
			case KIND_PROP_REST:
				const props = rerenderedComponentProps(bindingInfo.componentIndex);
				for (const propName of bindingInfo.currentNames) {
					delete props[propName];
				}
				for (const [ propName, propValue ] of Object.entries(args[index])) {
					props[propName] = propValue;
				}
				bindingInfo.currentNames = Object.keys(args[index]);
				break;
			}
		});
		oldArgs.splice(0, oldArgs.length, ...args);

		for (const index of Object.keys(componentInstancesToRerender)) {
			const instance = argBindingInfo[index].instance;
			if (args[index] !== instance.componentFn) {
				instance.componentFn = args[index];
				instance.nodeCache = new Map();
				instance.stateValues = [];
				instance.statePosition = 0;
				instance.isFirstUse = true;
			}
			renderComponentInstance(instance);
		}

		return nodes;
	}

	const cloned = precompiled.fragment.cloneNode(true);

	// We need a most-deep-first ordering
	const nodesToPatch = [ ...cloned.querySelectorAll("[data-steam-node-id]") ];
	nodesToPatch.reverse();
	for (const node of nodesToPatch) {
		const {
			contentIndex,
			ofComponentIndex,
			componentIndex,
			attributes,
		} = precompiled.substitutedNodes[node.dataset["steamNodeId"]];
		delete node.dataset["steamNodeId"];

		if (componentIndex !== null) {
			handleComponentArg(componentIndex, node, attributes);
			continue;
		}

		if (contentIndex !== null) {
			handleContentArg(contentIndex, node, ofComponentIndex);
		}

		for (const { name, valueIndex } of attributes) {
			if (name === "") {
				const value = args[valueIndex];
				for (const [ propName, propValue ] of Object.entries(value)) {
					applyAttribute(propNameToAttributeName(propName), propValue, node);
				}
				argBindingInfo[valueIndex] = {
					bindingKind: KIND_ATTRIBUTE_REST,
					node,
					currentNames: Object.keys(value).map(propNameToAttributeName),
				};
			} else {
				handleAttributeArg(name, valueIndex, node);
			}
		}
	}

	const nodes = [ ...cloned.childNodes ];
	cacheGroup.nodeList[cacheGroup.nodePosition++] = {
		nodes,
		args,
		argBindingInfo,
	};

	return nodes;
};

window["Steam"] = Steam;

const replaceNodes = (oldNodes, newNodes) => {
	let i = 0;
	for (; i < oldNodes.length && i < newNodes.length; i++) {
		if (oldNodes[i] !== newNodes[i]) {
			oldNodes[i].replaceWith(newNodes[i]);
		}
	}
	oldNodes.slice(i).forEach(node => node.remove());
	if (i < newNodes.length) {
		const fragment = new DocumentFragment();
		fragment.append(...newNodes.slice(i));
		oldNodes[i - 1].parentNode.insertBefore(newNodes, oldNodes[i - 1].nextSibling);
	}
};

const attributeNameToPropName = name => name.replace(/-[a-z]/g, s => s[1].toUpperCase());
const propNameToAttributeName = name => name.replace(/[A-Z]/g, s => "-" + s.toLowerCase());

const precompile = strings => {
	let html = "";
	strings.forEach((string, i) => {
		if (i > 0) {
			if (html.endsWith("<")) {
				html += `steam-node data-steam-substitution-index="${i - 1}"`;
			} else if (html.endsWith("</")) {
				html += "steam-node";
			} else {
				html += `\ufffe${i - 1}\ufffe`;
			}
		}
		if (string.indexOf("\ufffe") !== -1) {
			throw new SyntaxError("A U+FFFE character is invalid in a template literal");
		}
		html += string.replace(/<\/>/g, "</steam-node \ufffe>");
	});

	const template = document.createElement("template");
	template.innerHTML = html;

	const walker = document.createTreeWalker(template.content, SHOW_ELEMENT | SHOW_TEXT);
	const delayedActions = [];
	const substitutedNodes = [];
	const slotIndices = [];

	while (walker.nextNode()) {
		const node = walker.currentNode;

		if (node.nodeType === ELEMENT_NODE) {
			let nodeId = null;
			const substitution = () => {
				if (nodeId === null) {
					nodeId = substitutedNodes.length;
					substitutedNodes.push({
						contentIndex: null,
						ofComponentIndex: null,
						componentIndex: null,
						attributes: [],
					});
					node.dataset["steamNodeId"] = nodeId;
				}
				return substitutedNodes[nodeId];
			};

			if (node.tagName === "STEAM-NODE") {
				substitution().componentIndex = +node.dataset["steamSubstitutionIndex"];
				delete node.dataset["steamSubstitutionIndex"];
			}

			for (const attribute of [ ...node.attributes ]) {
				attribute.value = attribute.value.replace(/<\/steam-node \ufffe>/g, "</>");

				const nameMatch = attribute.name.match(/^\ufffe(\d+)\ufffe$/);
				if (nameMatch) {
					substitution().attributes.push({
						name: "",
						valueIndex: +nameMatch[1],
					});
					node.removeAttributeNode(attribute);
				}

				const valueMatch = attribute.value.match(/^\ufffe(\d+)\ufffe$/);
				if (valueMatch) {
					substitution().attributes.push({
						name: attribute.name,
						valueIndex: +valueMatch[1],
					});
					node.removeAttributeNode(attribute);
				}
			}
		} else if (node.nodeType === TEXT_NODE) {
			node.nodeValue = node.nodeValue.trim();
			if (node.nodeValue === "") {
				delayedActions.push(() => node.remove());
			}
			if (node.nodeValue.indexOf("\ufffe") === -1) {
				continue;
			}

			const text = node.nodeValue;
			const regex = /\ufffe(\d+)\ufffe/g;
			const fragment = new DocumentFragment();
			let textStartIndex = 0;
			let match;
			while (match = regex.exec(text)) {
				if (textStartIndex < match.index) {
					fragment.append(text.slice(textStartIndex, match.index));
				}

				let ofComponentIndex = null;
				if (node.parentNode.tagName === "STEAM-NODE") {
					ofComponentIndex = +node.parentNode.dataset["steamNodeId"];
				}

				const nodeId = substitutedNodes.length;
				substitutedNodes.push({
					contentIndex: +match[1],
					ofComponentIndex,
					componentIndex: null,
					attributes: [],
				});
				const slot = document.createElement("slot");
				slot.dataset["steamNodeId"] = nodeId;
				fragment.append(slot);

				textStartIndex = regex.lastIndex;
			}
			if (textStartIndex < text.length) {
				fragment.append(text.slice(textStartIndex));
			}
			delayedActions.push(() => node.replaceWith(fragment));
		}
	}

	for (const action of delayedActions) {
		action();
	}

	return { fragment: template.content, substitutedNodes };
};

Steam["css"] = (strings, ...interpolations) => props => {
	let css = "";
	strings.forEach((string, i) => {
		if (i > 0) {
			let interpolation = interpolations[i - 1];
			while (typeof interpolation === "function") {
				interpolation = interpolation(props);
			}
			if (interpolation || typeof interpolation === "number") {
				css += interpolation;
			}
		}
		css += string;
	});
	return css;
};

const styleNode = document.createElement("style");
document.head.append(styleNode);
const cssCache = new Map();

Steam["styled"] = new Proxy(
	componentFn => (...args) => {
		const cssFn = Steam["css"](...args);

		return props => {
			const css = cssFn(props);
			let className = cssCache.get(css);
			if (!className) {
				className = `steam-${cssCache.size}`;
				styleNode.sheet.insertRule(`.${className}{${css}}`);
				cssCache.set(css, className);
			}

			props = { ...props };
			if (!props["class"]) {
				props["class"] = className;
			} else if (Array.isArray(props["class"])) {
				props["class"] = [ className, ...props["class"] ];
			} else if (typeof props["class"] === "object") {
				props["class"] = { [className]: true, ...props["class"] };
			} else {
				props["class"] += ` ${className}`;
			}
			Object.freeze(props);
			return componentFn(props);
		};
	},
	{
		get(styled, name) {
			const strings = [`<${name} `, `></${name}>`];
			return styled(props => Steam(strings, props));
		},
	},
);

const newComponentInstance = (componentFn, props) => ({
	componentFn,
	props,
	nodeCache: new Map(),
	stateValues: [],
	statePosition: 0,
	isFirstUse: true,
	nodes: null,
});

const renderComponentInstance = instance => {
	const oldInstace = currentComponentInstance;
	currentComponentInstance = instance;
	const nodes = instance.componentFn(instance.props);
	for (const [ strings, cacheGroup ] of instance.nodeCache) {
		cacheGroup.nodeList.splice(cacheGroup.nodePosition, cacheGroup.nodeList.length);
		cacheGroup.nodePosition = 0;
	}
	instance.statePosition = 0;
	if (instance.nodes) {
		replaceNodes(instance.nodes, nodes);
	}
	instance.isFirstUse = false;
	instance.nodes = nodes;
	currentComponentInstance = oldInstace;
	return nodes;
};

Steam["useState"] = defaultValue => {
	const instance = currentComponentInstance;
	let position = instance.statePosition++;
	if (instance.isFirstUse) {
		instance.stateValues.push(defaultValue);
	}
	const value = instance.stateValues[position];
	return [
		value,
		newValue => {
			if (value !== newValue) {
				instance.stateValues[position] = newValue;
				renderComponentInstance(instance);
			}
		},
	];
};

Steam["attach"] = (parentNode, componentFn) => {
	const instance = newComponentInstance(componentFn, {});
	parentNode.append(...renderComponentInstance(instance));
};

})();
