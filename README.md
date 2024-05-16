# Steam

Steam is React, minus the bullshit.

It's a 3 KB library (gzipped) that enables you to use React-like environment without a build system or large dependencies like this:

```html
<!DOCTYPE html>
<body>
<script type="text/javascript" src="steam.min.js"></script>
<script>
function Clicker() {
	const [ count, setCount ] = Steam.useState(0);
	return Steam`
		<input value=${count} oninput=${e => setCount(+e.target.value)}>
		<button onclick=${() => setCount(count + 1)}>Increment</button>
		<button onclick=${() => setCount(count - 1)}>Decrement</button>
	`;
}
Steam.attach(document.body, Clicker);
</script>
```


## Crash course

Create and mount a component:

```javascript
function MyComponent() {
	return Steam`
		<div>
			Hello, world!
		</div>
	`;
}
Steam.attach(document.body, MyComponent);
```

Nest components and use props:

```javascript
function Greeting({ name }) {
	return Steam`
		Hello, ${name}!
	`;
}

// Not a necessary addition, just a demonstration of rest props
function PassPropsRecursively({ component, ...rest }) {
	return Steam`
		<${component} ${rest}></> <!-- Sorry, no autoclosing tags -->
	`;
}

function Root() {
	return Steam`
		<${PassPropsRecursively} component=${Greeting} name="Alisa"></>
	`;
}

Steam.attach(document.body, Root);
```

Inline content:

```javascript
function Greeting({ children }) {
	return Steam`
		Hello, ${children}!
	`;
}
Steam.attach(document.body, () => Steam`
	<${Greeting}>Alisa</>
`);
```

Handle events with reactivity:

```javascript
function Clicker() {
	const [ count, setCount ] = Steam.useState(0);
	return Steam`
		<button onclick=${() => setCount(count + 1)}>
			This button was clicked ${count} time${count === 1 ? "" : "s"}
		</button>
	`;
}
Steam.attach(document.body, Clicker);
```

Style stuff (mixing inline styles and styled components as an example):

```javascript
const Button = Steam.styled.button`
	color: ${props => props.disabled ? "red" : "black"};
`;
function EnhancedClicker() {
	const [ count, setCount ] = Steam.useState(0);
	return Steam`
		<input
			value=${count}
			oninput=${e => setCount(+e.target.value)}
			style=${{ color: count < 0 ? "red" : "black" }}
		>
		<${Button} onclick=${() => setCount(count + 1)}>
			Increment
		</>
		<${Button} disabled=${count <= 0} onclick=${() => setCount(count - 1)}>
			Decrement
		</>
	`;
}
Steam.attach(document.body, EnhancedClicker);
```

Handle lists:

```javascript
function List({ items }) {
	return Steam`
		<ul>
			${items.map(item => Steam`<li>${item}</li>`)}
		</ul>
	`;
}
Steam.attach(document.body, () => Steam`
	<${List} items=${[1, 2, 3]}></>
`);
```

Caveats:

- Kebab-case attribute names in template strings are mapped to camelCase prop names: `<${Component} hello-world=${123}></>` is visible as prop `helloWorld` in the component.
- Event handlers are all lowercase.
- Use `dangerously-set-inner-html=${{__html: ...}}` to set innerHTML directly. This maps to prop name `dangerouslySetInnerHtml`, not `dangerouslySetInnerHTML`.
