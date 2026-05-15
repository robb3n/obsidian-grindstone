import { App, Component, MarkdownRenderer } from 'obsidian';
import { CardData } from '../card/types';
import { CardManager } from '../card/card-manager';

/**
 * Render a card's answer (block content) into `container`.
 * Used by both ReviewModal and the inline workspace review.
 */
export async function renderCardAnswer(
  container: HTMLElement,
  card: CardData,
  cardId: string,
  cardManager: CardManager,
  app: App,
  component: Component,
): Promise<void> {
  const blockContent = await cardManager.getBlockContent(card, cardId);
  await MarkdownRenderer.render(app, blockContent, container, card.file, component);
}
