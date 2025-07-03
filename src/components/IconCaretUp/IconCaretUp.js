import React from 'react';
import classNames from 'classnames';

import css from './IconCaretUp.module.css';

/**
 * Caret up icon for table sorting
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own root class
 * @param {string?} props.rootClassName overwrite components own root class
 * @returns {JSX.Element} "caret up" icon
 */
const IconCaretUp = props => {
  const { className, rootClassName } = props;
  const classes = classNames(rootClassName || css.root, className);

  return (
    <svg className={classes} viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor">
      <path d="M858.9 689L530.5 308.2c-9.4-10.9-27.5-10.9-37 0L165.1 689c-12.2 14.2-1.2 35 18.5 35h656.8c19.7 0 30.7-20.8 18.5-35z"></path>
    </svg>
  );
};

export default IconCaretUp;
