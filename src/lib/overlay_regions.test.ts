import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  areInteractiveRegionsEqual,
  collectInteractiveRegions,
  isVisible,
  toInteractiveRegion,
} from './overlay_regions.ts'

type TestStyle = {
  display?: string
  visibility?: string
  pointerEvents?: string
}

type TestNode = {
  nodeType: number
  parentElement: TestElement | null
  textContent?: string
}

type TestElement = TestNode & {
  ariaDisabled?: string
  childNodes: TestNode[]
  dataDisabled?: string
  disabled?: boolean
  getBoundingClientRect: () => DOMRect
  href?: string
  parentElement: TestElement | null
  querySelectorAll: () => TestElement[]
  role?: string
  style: TestStyle
}

class TestDOMRect {
  bottom: number
  left: number
  right: number
  top: number

  constructor(
    left: number,
    top: number,
    public width: number,
    public height: number,
  ) {
    this.left = left
    this.top = top
    this.right = left + width
    this.bottom = top + height
  }
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function createElement(rect: DOMRect, style: TestStyle = {}): TestElement {
  return {
    childNodes: [],
    getBoundingClientRect: () => rect,
    nodeType: ELEMENT_NODE,
    parentElement: null,
    querySelectorAll() {
      return this.childNodes.filter((node): node is TestElement => node.nodeType === ELEMENT_NODE)
    },
    style,
  }
}

function createTextNode(textContent: string): TestNode {
  return {
    nodeType: TEXT_NODE,
    parentElement: null,
    textContent,
  }
}

function append(parent: TestElement, ...children: TestNode[]) {
  parent.childNodes.push(...children)

  for (const child of children) {
    child.parentElement = parent
  }
}

function rootWith(...elements: TestElement[]) {
  return {
    querySelectorAll: () =>
      elements.filter((element) => !element.disabled && element.ariaDisabled !== 'true' && !element.dataDisabled),
  } as unknown as ParentNode
}

function rect(left: number, top: number, width: number, height: number) {
  return new TestDOMRect(left, top, width, height) as DOMRect
}

function mockTextRects(...rects: DOMRect[]) {
  vi.mocked(document.createRange).mockReturnValue({
    detach: vi.fn(),
    getClientRects: () => rects as unknown as DOMRectList,
    selectNodeContents: vi.fn(),
  } as unknown as Range)
}

beforeEach(() => {
  vi.stubGlobal('DOMRect', TestDOMRect)
  vi.stubGlobal('Node', {
    ELEMENT_NODE,
    TEXT_NODE,
  })
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    getComputedStyle: (element: TestElement) => ({
      display: element.style.display ?? 'block',
      pointerEvents: element.style.pointerEvents ?? 'auto',
      visibility: element.style.visibility ?? 'visible',
    }),
  })
  vi.stubGlobal('document', {
    createRange: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('overlay regions', () => {
  it('converts CSS pixels to physical pixels with DPR-aware padding', () => {
    window.devicePixelRatio = 2

    expect(toInteractiveRegion(rect(10, 20, 30, 40))).toEqual({
      x: 16,
      y: 36,
      width: 68,
      height: 88,
    })
  })

  it('treats elements hidden by a parent as invisible', () => {
    const parent = createElement(rect(0, 0, 20, 20), { display: 'none' })
    const button = createElement(rect(0, 0, 10, 10))

    append(parent, button)

    expect(isVisible(button as unknown as HTMLElement)).toBe(false)
  })

  it('collects visible interactive elements only', () => {
    const button = createElement(rect(10, 20, 30, 40))
    const hiddenLink = createElement(rect(1, 1, 10, 10), { visibility: 'hidden' })

    expect(collectInteractiveRegions(rootWith(button, hiddenLink))).toEqual([
      {
        x: 8,
        y: 18,
        width: 34,
        height: 44,
      },
    ])
  })

  it('collects ARIA tab triggers as interactive elements', () => {
    const tab = createElement(rect(4, 8, 120, 24))
    tab.role = 'tab'

    expect(collectInteractiveRegions(rootWith(tab))).toEqual([
      {
        x: 2,
        y: 6,
        width: 124,
        height: 28,
      },
    ])
  })

  it('ignores disabled ARIA interactive elements', () => {
    const tab = createElement(rect(4, 8, 120, 24))
    tab.ariaDisabled = 'true'
    tab.role = 'tab'

    expect(collectInteractiveRegions(rootWith(tab))).toEqual([])
  })

  it('collects visible children of display contents interactive elements', () => {
    const link = createElement(rect(0, 0, 0, 0), { display: 'contents' })
    link.href = '#'
    const label = createElement(rect(20, 30, 80, 12))

    append(link, label)

    expect(collectInteractiveRegions(rootWith(link))).toEqual([
      {
        x: 18,
        y: 28,
        width: 84,
        height: 16,
      },
    ])
  })

  it('collects text nodes of display contents interactive elements', () => {
    mockTextRects(rect(40, 30, 72, 14))

    const link = createElement(rect(0, 0, 0, 0), { display: 'contents' })
    link.href = '#'
    const icon = createElement(rect(20, 30, 12, 12))
    const text = createTextNode(' Open guide')

    append(link, icon, text)

    expect(collectInteractiveRegions(rootWith(link))).toEqual([
      {
        x: 18,
        y: 28,
        width: 16,
        height: 16,
      },
      {
        x: 38,
        y: 28,
        width: 76,
        height: 18,
      },
    ])
  })

  it('ignores display contents interactive elements when their pointer path is hidden', () => {
    const link = createElement(rect(0, 0, 0, 0), {
      display: 'contents',
      pointerEvents: 'none',
    })
    link.href = '#'
    const label = createElement(rect(20, 30, 80, 12))

    append(link, label)

    expect(collectInteractiveRegions(rootWith(link))).toEqual([])
  })

  it('compares region payloads by value', () => {
    const regions = [{ x: 1, y: 2, width: 3, height: 4 }]

    expect(areInteractiveRegionsEqual(regions, [{ x: 1, y: 2, width: 3, height: 4 }])).toBe(true)
    expect(areInteractiveRegionsEqual(regions, [{ x: 1, y: 2, width: 3, height: 5 }])).toBe(false)
  })
})
