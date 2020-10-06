import Icon from './components/Icon.js';
import loadFont from './fonts/loadFont.js';

Promise.all([
	loadFont('Roboto', '/fonts/Roboto-Bold.woff2'),
	loadFont('Roboto Condensed', '/fonts/Roboto-Condensed-Bold.woff2'),
]).then(() => Array(500).fill(null).forEach((_, i) => {
	document.body.appendChild(new Icon('#000').render(++i).canvas);
}));
