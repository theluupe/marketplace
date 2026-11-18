import React from 'react';

import { Heading } from '../../components';

import css from './PageMessage.module.css';

/**
 * A page-level message laid out like the 404 page (NotFoundPage): a small blue label, the title and the text,
 * centered in a narrow column, then the actions. No background box or banner: Rafael's call for the login error
 * pages, 2026-11-17 (spec/v0/account-linking.md §6.1).
 *
 * @component
 * @param {Object} props
 * @param {ReactNode} props.label the small blue line above the title
 * @param {ReactNode} props.title the page's h1
 * @param {ReactNode?} props.children the text, centered paragraphs
 * @param {ReactNode?} props.actions buttons and their notes, in a narrower column below
 * @returns {JSX.Element}
 */
const PageMessage = ({ label, title, children, actions }) => (
  <div className={css.root}>
    <div className={css.content}>
      <div className={css.label}>{label}</div>
      <Heading as="h1" rootClassName={css.title}>
        {title}
      </Heading>
      {children ? <div className={css.text}>{children}</div> : null}
      {actions ? <div className={css.actions}>{actions}</div> : null}
    </div>
  </div>
);

export default PageMessage;
