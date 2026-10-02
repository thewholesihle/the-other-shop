<script>
  // A payment brand mark, drawn in the surrounding text colour (CSS mask over /public/payments/*.svg),
  // so it stays legible on any store palette — light or dark footer, checkout card, whatever.
  export let id;
  export let height = 18; // px

  const BRANDS = {
    visa:       { label: 'Visa',             ratio: 2.9 },
    mastercard: { label: 'Mastercard',       ratio: 1.59 },
    amex:       { label: 'American Express', ratio: 1 },
    applepay:   { label: 'Apple Pay',        ratio: 1.53 },
    googlepay:  { label: 'Google Pay',       ratio: 2.4 },
    payfast:    { label: 'PayFast',          ratio: 2.77 },
    yoco:       { label: 'Yoco',             ratio: 4.11 },
  };
  $: brand = BRANDS[id] || { label: id, ratio: 2 };
  $: url = `url(/payments/${id}.svg)`;
</script>

<span
  role="img"
  aria-label={brand.label}
  title={brand.label}
  class="inline-block shrink-0"
  style="height:{height}px;width:{Math.round(height * brand.ratio)}px;background-color:currentColor;-webkit-mask:{url} center/contain no-repeat;mask:{url} center/contain no-repeat;"
></span>
