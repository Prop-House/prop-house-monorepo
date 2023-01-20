import classes from './ProposalEditor.module.css';
import { Row, Col, Form } from 'react-bootstrap';
import { useAppSelector } from '../../hooks';
import { ProposalFields } from '../../utils/proposalFields';
import 'react-quill/dist/quill.snow.css';
import { useEffect, useRef, useState } from 'react';
import { useQuill } from 'react-quilljs';
import clsx from 'clsx';
import QuillEditorModal from '../QuillEditorModal';
import '../../quill.css';
import { useTranslation } from 'react-i18next';
import { PropHouseWrapper } from '@nouns/prop-house-wrapper';
import { useEthers } from '@usedapp/core';
import NewModal from '../NewModal';
import Button, { ButtonColor } from '../Button';
import DropFileInput from '../DropFileInput';

const ProposalEditor: React.FC<{
  fields?: ProposalFields;
  onDataChange: (data: Partial<ProposalFields>) => void;
}> = props => {
  const { fields, onDataChange } = props;
  const data = useAppSelector(state => state.editor.proposal);
  const [blurred, setBlurred] = useState(false);
  const [editorBlurred, setEditorBlurred] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const { t } = useTranslation();

  const { library } = useEthers();
  const host = useAppSelector(state => state.configuration.backendHost);
  const client = useRef(new PropHouseWrapper(host));

  useEffect(() => {
    client.current = new PropHouseWrapper(host, library?.getSigner());
  }, [library, host]);
  const signerless = new PropHouseWrapper('https://prod.backend.prop.house');

  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [successfulUpload, setSuccessfulUpload] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<boolean>(false);

  const validateInput = (min: number, count: number) => 0 < count && count < min;

  const formData = [
    {
      title: t('title'),
      focus: true,
      type: 'input',
      fieldValue: data.title,
      fieldName: 'title',
      placeholder: t('titlePlaceholder'),
      value: '',
      minCount: 5,
      maxCount: 80,
      error: t('titleError'),
    },
    {
      title: t('tldr'),
      type: 'input',
      fieldValue: data.tldr,
      fieldName: 'tldr',
      placeholder: t('tldrPlaceholder'),
      value: '',
      minCount: 10,
      maxCount: 120,
      error: t('tldrError'),
    },
  ];

  const descriptionData = {
    title: t('description'),
    type: 'textarea',
    fieldValue: data.what,
    fieldName: 'what',
    placeholder: t('descriptionPlaceholder'),
    value: '',
    minCount: 50,
    error: t('descriptionError'),
  };

  const handleImageUpload = async () => {
    try {
      setSuccessfulUpload(false);

      await Promise.all(
        files.map(async (file: File) => {
          return await signerless.postFile(file, file.name);
        }),
      );

      setSuccessfulUpload(true);
      setFiles([]);
    } catch (e) {
      setUploadError(true);
      console.log(uploadError);
      console.log(e);
    }
  };

  const formats = [
    'header',
    'bold',
    'underline',
    'strike',
    'blockquote',
    'code-block',
    'list',
    'bullet',
    'link',
    'image',
  ];

  const imageHandler = () => setShowImageUploadModal(true);
  // const imageHandler = () => setShowImageModal(true);
  const linkHandler = () => setShowLinkModal(true);

  const modules = {
    toolbar: {
      container: [
        [{ header: [1, 2, false] }],
        ['bold', 'underline', 'strike', 'blockquote', 'code-block'],
        [{ list: 'ordered' }],
        ['link'],
        ['image'],
      ],
    },
    clipboard: {
      matchVisual: false,
    },
  };
  const theme = 'snow';
  const placeholder = descriptionData.placeholder;

  const { quill, quillRef, Quill } = useQuill({
    theme,
    modules,
    formats,
    placeholder,
  });

  useEffect(() => {
    if (quill) {
      var toolbar = quill.getModule('toolbar');
      toolbar.addHandler('image', imageHandler);
      toolbar.addHandler('link', linkHandler);

      quill.clipboard.dangerouslyPasteHTML(data.what);

      quill.on('text-change', () => {
        setEditorBlurred(false);

        onDataChange({ what: quill.root.innerHTML });
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quill]);

  useEffect(() => {
    if (fields) onDataChange(fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

<<<<<<< HEAD
=======
  const handleDismiss = () => {
    setShowImageUploadModal(false);
    setSuccessfulUpload(false);
  };

>>>>>>> d5a19d71 (WIP: file upload)
  return (
    <>
      <Row>
        <Col xl={12}>
          <Form>
            <Form.Group className={classes.inputGroup}>
              {formData.map(input => {
                return (
                  <div className={classes.inputSection} key={input.title}>
                    <div className={classes.inputInfo}>
                      <Form.Label className={classes.inputLabel}>{input.title}</Form.Label>
                      <Form.Label className={classes.inputChars}>
                        {input.maxCount
                          ? `${input.fieldValue.length}/${input.maxCount}`
                          : input.fieldValue.length}
                      </Form.Label>
                    </div>

                    <Form.Control
                      as={input.type as any}
                      autoFocus={input.focus}
                      maxLength={input.maxCount && input.maxCount}
                      placeholder={input.placeholder}
                      className={clsx(
                        classes.input,
                        input.fieldName === 'what' && classes.descriptionInput,
                      )}
                      onChange={e => {
                        setBlurred(false);
                        onDataChange({ [input.fieldName]: e.target.value });
                      }}
                      value={data && input.fieldValue}
                      onBlur={() => {
                        setBlurred(true);
                      }}
                    />

                    {blurred && validateInput(input.minCount, input.fieldValue.length) && (
                      <p className={classes.inputError}>{input.error}</p>
                    )}
                  </div>
                );
              })}

              <>
                <div className={classes.inputInfo}>
                  <Form.Label className={clsx(classes.inputLabel, classes.descriptionLabel)}>
                    {descriptionData.title}
                  </Form.Label>

                  <Form.Label className={classes.inputChars}>
                    {quill && quill.getText().length - 1}
                  </Form.Label>
                </div>

                <>
                  {/* 
                    When scrolling past the window height the sticky Card header activates, but the header has rounded borders so you still see the borders coming up from the Card body. `hideBorderBox` is a sticky, empty div with a fixed height that hides these borders. 
                  */}
                  <div className="hideBorderBox"></div>
                  <div
                    ref={quillRef}
                    placeholder={descriptionData.placeholder}
                    onBlur={() => {
                      setEditorBlurred(true);
                    }}
                  />

                  {editorBlurred &&
                    quill &&
                    validateInput(descriptionData.minCount, quill.getText().length - 1) && (
                      <p className={classes.inputError}>{descriptionData.error}</p>
                    )}
                </>
              </>
            </Form.Group>
          </Form>
        </Col>
      </Row>

      <QuillEditorModal
        quill={quill}
        Quill={Quill}
        title={t('addLink')}
        subtitle={t('pasteLink')}
        showModal={showLinkModal}
        setShowModal={setShowLinkModal}
        placeholder="ex. https://nouns.wtf/"
        quillModule="link"
      />

      <QuillEditorModal
        quill={quill}
        Quill={Quill}
        title={t('addImage')}
        subtitle={t('pasteImage')}
        showModal={showImageModal}
        setShowModal={setShowImageModal}
        placeholder="ex. https://noun.pics/1.jpg"
        quillModule="image"
      />

      <NewModal
        title={successfulUpload ? `Upload Successful` : ''}
        subtitle={
          successfulUpload
            ? `You have uploaded ${files.length}  ${files.length === 1 ? 'file' : 'files'}!`
            : ''
        }
        showModal={showImageUploadModal}
        image={successfulUpload}
        setShowModal={setShowImageUploadModal}
        onRequestClose={handleDismiss}
        secondButton={
          successfulUpload ? (
            <Button text={'Back to Editor'} bgColor={ButtonColor.Purple} onClick={handleDismiss} />
          ) : (
            <Button text={t('Upload')} bgColor={ButtonColor.Green} onClick={handleImageUpload} />
          )
        }
        body={!successfulUpload && <DropFileInput files={files} setFiles={setFiles} />}
      />
    </>
  );
};

export default ProposalEditor;
