import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

import { FormattedMessage } from '../../../util/reactIntl';
import { Modal } from '../../../components';

import css from './Topbar.module.css';

// Set at login by server/api/auth/loginWithIdp.js for a buyer or creator who came through a brand
// link (spec/v0/login-and-registration.md §4.5.5, BR15). Shown once: the cookie is removed when read.
const NOTICE_COOKIE = 'st-authnotice';
const NOTICE_MESSAGES = {
  'registered-as-buyer': 'LoginNotice.registeredAsBuyer',
  'registered-as-creator': 'LoginNotice.registeredAsCreator',
};

const readNoticeCode = () => {
  try {
    const cookie = Cookies.get(NOTICE_COOKIE);
    return cookie ? JSON.parse(cookie.replace('j:', '')).code : null;
  } catch (e) {
    return null;
  }
};

const LoginNotice = ({ onManageDisableScrolling }) => {
  const [messageId, setMessageId] = useState(null);

  // In the browser only: the server's render never has the cookie.
  useEffect(() => {
    const noticeMessageId = NOTICE_MESSAGES[readNoticeCode()];
    if (noticeMessageId) {
      Cookies.remove(NOTICE_COOKIE);
      setMessageId(noticeMessageId);
    }
  }, []);

  return (
    <Modal
      id="LoginNotice"
      isOpen={!!messageId}
      onClose={() => setMessageId(null)}
      usePortal
      onManageDisableScrolling={onManageDisableScrolling}
    >
      {messageId ? (
        <p className={css.loginNotice}>
          <FormattedMessage id={messageId} />
        </p>
      ) : null}
    </Modal>
  );
};

export default LoginNotice;
