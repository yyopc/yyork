const GLIMM_GUI_POSITION_KEY = 'yyork:glimm:gui-position';

type GlimmGuiPosition = {
  left: number;
  top: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readSemanticColor(
  className: string,
  property: 'backgroundColor' | 'color' | 'borderColor'
) {
  const probe = document.createElement('div');
  probe.className = className;
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.inset = '0 auto auto 0';
  document.body.appendChild(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

/** Map yyork semantic tokens onto lil-gui CSS variables. */
export function applyYorkThemeToLilGui(root: HTMLElement) {
  const bodyFont = getComputedStyle(document.body).fontFamily;

  root.style.setProperty(
    '--background-color',
    readSemanticColor('bg-background', 'backgroundColor')
  );
  root.style.setProperty(
    '--title-background-color',
    readSemanticColor('bg-muted', 'backgroundColor')
  );
  root.style.setProperty(
    '--text-color',
    readSemanticColor('text-foreground', 'color')
  );
  root.style.setProperty(
    '--title-text-color',
    readSemanticColor('text-foreground', 'color')
  );
  root.style.setProperty(
    '--widget-color',
    readSemanticColor('bg-muted', 'backgroundColor')
  );
  root.style.setProperty(
    '--hover-color',
    readSemanticColor('bg-accent', 'backgroundColor')
  );
  root.style.setProperty(
    '--focus-color',
    readSemanticColor('bg-accent', 'backgroundColor')
  );
  root.style.setProperty(
    '--number-color',
    readSemanticColor('text-foreground', 'color')
  );
  root.style.setProperty(
    '--string-color',
    readSemanticColor('text-muted-foreground', 'color')
  );
  root.style.setProperty('--font-family', bodyFont);
  root.style.setProperty('--widget-border-radius', '6px');
  root.style.border = `1px solid ${readSemanticColor('border-border', 'borderColor')}`;
  root.style.borderRadius = '10px';
  root.style.overflow = 'hidden';
  root.style.boxShadow =
    '0 8px 24px rgba(10, 10, 10, 0.12), 0 2px 6px rgba(10, 10, 10, 0.06)';

  if (document.documentElement.classList.contains('dark')) {
    root.style.boxShadow =
      '0 8px 24px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.32)';
  }
}

function loadGlimmGuiPosition(): GlimmGuiPosition | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(GLIMM_GUI_POSITION_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<GlimmGuiPosition>;
    if (
      typeof parsed.left !== 'number' ||
      typeof parsed.top !== 'number' ||
      !Number.isFinite(parsed.left) ||
      !Number.isFinite(parsed.top)
    ) {
      return undefined;
    }

    return parsed as GlimmGuiPosition;
  } catch {
    return undefined;
  }
}

function saveGlimmGuiPosition(position: GlimmGuiPosition) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(
    GLIMM_GUI_POSITION_KEY,
    JSON.stringify(position)
  );
}

/** Drag the panel by its lil-gui title bar; position persists in sessionStorage. */
export function attachFloatableLilGui(root: HTMLElement) {
  const title = root.querySelector('.lil-title');
  if (!(title instanceof HTMLElement)) {
    return () => undefined;
  }

  root.classList.add('yyork-glimm-gui');
  root.style.position = 'fixed';
  root.style.zIndex = '10000';
  root.style.margin = '0';
  root.style.maxHeight = 'min(80vh, 720px)';

  const saved = loadGlimmGuiPosition();
  if (saved) {
    root.style.left = `${saved.left}px`;
    root.style.top = `${saved.top}px`;
    root.style.right = 'auto';
  } else {
    root.style.top = '12px';
    root.style.right = '12px';
    root.style.left = 'auto';
  }

  title.style.cursor = 'grab';
  title.style.userSelect = 'none';
  title.title = 'Drag to move';

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const rect = root.getBoundingClientRect();
    root.style.right = 'auto';
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    title.setPointerCapture(event.pointerId);
    title.style.cursor = 'grabbing';

    const onPointerMove = (moveEvent: PointerEvent) => {
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      const left = clamp(
        moveEvent.clientX - offsetX,
        8,
        Math.max(8, window.innerWidth - width - 8)
      );
      const top = clamp(
        moveEvent.clientY - offsetY,
        8,
        Math.max(8, window.innerHeight - height - 8)
      );

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      title.releasePointerCapture(upEvent.pointerId);
      title.style.cursor = 'grab';
      title.removeEventListener('pointermove', onPointerMove);
      title.removeEventListener('pointerup', onPointerUp);
      title.removeEventListener('pointercancel', onPointerUp);

      saveGlimmGuiPosition({
        left: parseFloat(root.style.left) || rect.left,
        top: parseFloat(root.style.top) || rect.top,
      });
    };

    title.addEventListener('pointermove', onPointerMove);
    title.addEventListener('pointerup', onPointerUp);
    title.addEventListener('pointercancel', onPointerUp);
  };

  title.addEventListener('pointerdown', onPointerDown);

  return () => {
    title.removeEventListener('pointerdown', onPointerDown);
  };
}
